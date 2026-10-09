import chalk from 'chalk';
import { GRAPHITE_COLORS } from '../lib/colors';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { KilledError, PreconditionsFailedError } from '../lib/errors';
import {
  commitTree,
  detachAt,
  getChangedPaths,
  getCommitAuthorEnv,
  getCommitMessage,
  getTree,
  indexInfoFrom,
  treeWithIndexInfo,
} from '../lib/git/plumbing';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { replaceUnsupportedCharacters } from '../lib/utils/branch_name';
import { clearPromptResultLine } from '../lib/utils/prompts_helpers';
import { restackBranches } from './restack';
import { trackBranch } from './track_branch';

type TSplit = {
  // list of branch names from oldest to newest
  branchNames: string[];
  // list of commits to branch at keyed by distance from HEAD,
  // i.e. if the branch log shows:
  // C
  // B
  // A
  // and we have [0,2] we would branch at A and C
  branchPoints: number[];
};
export async function splitCurrentBranch(
  args: { style: 'hunk' | 'commit' | undefined; byFile?: string[] },
  context: TContext
): Promise<void> {
  if (args.byFile?.length) {
    return splitByFile(args.byFile, context);
  }
  if (!context.interactive) {
    throw new PreconditionsFailedError(
      'This command must be run in interactive mode.'
    );
  }
  uncommittedTrackedChangesPrecondition();

  const branchToSplit = context.engine.currentBranchPrecondition;

  if (!context.engine.isBranchTracked(branchToSplit)) {
    await trackBranch(
      { branchName: branchToSplit, parentBranchName: undefined, force: false },
      context
    );
  }

  // If user did not select a style, prompt unless there is only one commit
  const style: 'hunk' | 'commit' | 'abort' =
    args.style ??
    (context.engine.getAllCommits(branchToSplit, 'SHA').length > 1
      ? (
          await context.prompts({
            type: 'select',
            name: 'value',
            message: `How would you like to split ${branchToSplit}?`,
            choices: [
              {
                title: 'By commit - slice up the history of this branch.',
                value: 'commit',
              },
              {
                title: 'By hunk - split into new single-commit branches.',
                value: 'hunk',
              },
              { title: 'Cancel this command (Ctrl+C).', value: 'abort' },
            ],
          })
        ).value
      : 'hunk');

  const actions = {
    commit: splitByCommit,
    hunk: splitByHunk,
    abort: () => {
      throw new KilledError();
    },
  };

  applySplit(
    branchToSplit,
    await actions[style](branchToSplit, context),
    context
  );
}

function applySplit(branchToSplit: string, split: TSplit, context: TContext) {
  const children = context.engine.getRelativeStack(
    branchToSplit,
    SCOPE.UPSTACK_EXCLUSIVE
  );

  context.engine.applySplitToCommits({
    branchToSplit,
    ...split,
  });

  restackBranches(children, context);
}

// Moves the changes to the matched files into a new branch inserted below the
// current one. The current branch keeps its commits (minus those files, and
// minus commits left empty) and ends at the same tree it started with.
async function splitByFile(
  pathspecs: string[],
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();
  const branchToSplit = context.engine.currentBranchPrecondition;
  if (!context.engine.isBranchTracked(branchToSplit)) {
    await trackBranch(
      { branchName: branchToSplit, parentBranchName: undefined, force: false },
      context
    );
  }

  const base = context.engine.getBaseRevision(branchToSplit);
  const head = context.engine.getRevision(branchToSplit);
  const paths = getChangedPaths(base, head, pathspecs);
  if (paths.length === 0) {
    throw new PreconditionsFailedError(
      `No changes in ${chalk.cyan(branchToSplit)} match ${pathspecs.join(' ')}.`
    );
  }

  const fromHead = indexInfoFrom(head, paths);
  const splitOff = commitTree({
    tree: treeWithIndexInfo(base, fromHead),
    parents: [base],
    message: context.engine
      .getAllCommits(branchToSplit, 'MESSAGE')
      .reverse()
      .join('\n\n'),
  });

  // Replay each commit with the matched files pinned to their final version,
  // so only the remaining changes show up in the current branch's history.
  let tip = splitOff;
  let remainingCommits = 0;
  for (const sha of context.engine
    .getAllCommits(branchToSplit, 'SHA')
    .reverse()) {
    const tree = treeWithIndexInfo(sha, fromHead);
    if (tree !== getTree(tip)) {
      tip = commitTree({
        tree,
        parents: [tip],
        message: getCommitMessage(sha),
        authorEnv: getCommitAuthorEnv(sha),
      });
      remainingCommits++;
    }
  }
  if (remainingCommits === 0) {
    throw new PreconditionsFailedError(
      `Every change in ${chalk.cyan(
        branchToSplit
      )} matches; nothing would remain. Use \`ch create --insert\` or \`ch rename\` instead.`
    );
  }
  const newBranchName = context.interactive
    ? await promptNextBranchName(
        { branchNames: [branchToSplit], branchToSplit },
        context
      )
    : getUniqueSplitBranchName(branchToSplit, context);

  // Same tree as the current checkout, so this never touches the work tree.
  detachAt(tip);
  applySplit(
    branchToSplit,
    {
      branchNames: [newBranchName, branchToSplit],
      branchPoints: [0, remainingCommits],
    },
    context
  );
  context.splog.info(
    `Split ${chalk.green(paths.length)} file(s) from ${chalk.cyan(
      branchToSplit
    )} into ${chalk.green(newBranchName)}.`
  );
}

function getUniqueSplitBranchName(
  branchToSplit: string,
  context: TContext
): string {
  let name = `${branchToSplit}_split`;
  while (context.engine.allBranchNames.includes(name)) {
    name = `${name}_split`;
  }
  return name;
}

async function splitByCommit(
  branchToSplit: string,
  context: TContext
): Promise<TSplit> {
  const instructions = getSplitByCommitInstructions(branchToSplit, context);
  context.splog.info(instructions);

  const readableCommits = context.engine.getAllCommits(
    branchToSplit,
    'READABLE'
  );
  const numChildren = context.engine.getChildren(branchToSplit).length;
  const parentBranchName = context.engine.getParentPrecondition(branchToSplit);

  const branchPoints = await getBranchPoints({
    readableCommits,
    numChildren,
    parentBranchName,
    context,
  });
  const branchNames: string[] = [];
  for (let i = 0; i < branchPoints.length; i++) {
    context.splog.info(chalk.yellow(`Commits for branch ${i + 1}:`));
    context.splog.info(
      readableCommits
        .slice(
          branchPoints[branchPoints.length - i - 1],
          // we want the next line to be undefined for i = 0
          branchPoints[branchPoints.length - i]
        )
        .join('\n')
    );
    context.splog.newline();
    branchNames.push(
      await promptNextBranchName({ branchNames, branchToSplit }, context)
    );
  }

  context.engine.detach();
  return { branchNames, branchPoints };
}

function getSplitByCommitInstructions(
  branchToSplit: string,
  context: TContext
): string {
  return [
    `Splitting the commits of ${chalk.cyan(
      branchToSplit
    )} into multiple branches.`,
    ...(context.engine.getPrInfo(branchToSplit)?.number
      ? [
          `If any of the new branches keeps the name ${chalk.cyan(
            branchToSplit
          )}, it will be linked to PR #${
            context.engine.getPrInfo(branchToSplit)?.number
          }.`,
        ]
      : []),
    ``,
    chalk.yellow(`For each branch you'd like to create:`),
    `1. Choose which commit it begins at using the below prompt.`,
    `2. Choose its name.`,
    ``,
  ].join('\n');
}

async function getBranchPoints({
  readableCommits,
  numChildren,
  parentBranchName,
  context,
}: {
  readableCommits: string[];
  numChildren: number;
  parentBranchName: string;
  context: TContext;
}): Promise<number[]> {
  // Array where nth index is whether we want a branch pointing to nth commit
  const isBranchPoint: boolean[] = readableCommits.map((_, idx) => idx === 0);

  //  start the cursor at the current commmit
  let lastValue = 0;
  // -1 signifies thatwe are done
  while (lastValue !== -1) {
    // We count branches in reverse so start at the total number of branch points
    let branchNumber = Object.values(isBranchPoint).filter((v) => v).length + 1;
    const showChildrenLine = numChildren > 0;
    lastValue = parseInt(
      (
        await context.prompts({
          type: 'select',
          name: 'value',
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore the types are out of date
          warn: ' ',
          message: `Toggle a commit to split the branch there.`,
          hint: 'Arrow keys and return/space. Select confirm to finish.',
          initial: lastValue + (showChildrenLine ? 1 : 0),
          choices: [
            ...(showChildrenLine
              ? [
                  {
                    title: chalk.reset(
                      `${' '.repeat(10)}${chalk.dim(
                        `${numChildren} ${
                          numChildren > 1 ? 'children' : 'child'
                        }`
                      )}`
                    ),
                    disabled: true,
                    value: '0', // noop
                  },
                ]
              : []),
            ...readableCommits.map((commit, index) => {
              const shouldDisplayBranchNumber = isBranchPoint[index];
              if (shouldDisplayBranchNumber) {
                branchNumber--;
              }

              const titleColor =
                GRAPHITE_COLORS[(branchNumber - 1) % GRAPHITE_COLORS.length];
              const titleText = `${
                shouldDisplayBranchNumber
                  ? `Branch ${branchNumber}: `
                  : ' '.repeat(10)
              }${commit}`;

              const title = chalk.rgb(...titleColor)(titleText);
              return { title, value: '' + index };
            }),
            {
              title: chalk.reset(
                `${' '.repeat(10)}${chalk.dim(parentBranchName)}`
              ),
              disabled: true,
              value: '0', // noop
            },
            {
              title: `${' '.repeat(10)}Confirm`,
              value: '-1', // done
            },
          ],
        })
      ).value
    );
    clearPromptResultLine();
    // Never toggle the first commmit, it always needs a branch
    if (lastValue !== 0) {
      isBranchPoint[lastValue] = !isBranchPoint[lastValue];
    }
  }

  return isBranchPoint
    .map((value, index) => (value ? index : undefined))
    .filter((value): value is number => typeof value !== 'undefined');
}

async function splitByHunk(
  branchToSplit: string,
  context: TContext
): Promise<TSplit> {
  // Keeps new files tracked so they get added by the `commit -p`
  context.engine.detachAndResetBranchChanges();

  const branchNames: string[] = [];
  try {
    const instructions = getSplitByHunkInstructions(branchToSplit, context);
    const defaultCommitMessage = context.engine
      .getAllCommits(branchToSplit, 'MESSAGE')
      .reverse()
      .join('\n\n');
    for (
      let unstagedChanges = context.engine.getUnstagedChanges();
      unstagedChanges.length > 0;
      unstagedChanges = context.engine.getUnstagedChanges()
    ) {
      context.splog.info(instructions);
      context.splog.newline();
      context.splog.info(chalk.yellow('Remaining changes:'));
      context.splog.info(' ' + unstagedChanges);
      context.splog.newline();
      context.splog.info(
        chalk.yellow(`Stage changes for branch ${branchNames.length + 1}:`)
      );
      context.engine.commit({
        message: defaultCommitMessage,
        edit: true,
        patch: true,
      });
      branchNames.push(
        await promptNextBranchName({ branchNames, branchToSplit }, context)
      );
    }
  } catch (e) {
    // Handle a CTRL-C gracefully
    context.engine.forceCheckoutBranch(branchToSplit);
    context.splog.newline();
    context.splog.info(
      `Exited early: no new branches created. You are still on ${chalk.cyan(
        branchToSplit
      )}.`
    );
    throw e;
  }

  return {
    branchNames,
    // for single-commit branches, there is a branch point at each commit
    branchPoints: branchNames.map((_, idx) => idx),
  };
}

function getSplitByHunkInstructions(
  branchToSplit: string,
  context: TContext
): string {
  return [
    `Splitting ${chalk.cyan(
      branchToSplit
    )} into multiple single-commit branches.`,
    ...(context.engine.getPrInfo(branchToSplit)?.number
      ? [
          `If any of the new branches keeps the name ${chalk.cyan(
            branchToSplit
          )}, it will be linked to PR #${
            context.engine.getPrInfo(branchToSplit)?.number
          }.`,
        ]
      : []),
    ``,
    chalk.yellow(`For each branch you'd like to create:`),
    `1. Follow the prompts to stage the changes that you'd like to include.`,
    `2. Enter a commit message.`,
    `3. Pick a branch name.`,
    `The command will continue until all changes have been added to a new branch.`,
  ].join('\n');
}

async function promptNextBranchName(
  {
    branchToSplit,
    branchNames,
  }: {
    branchToSplit: string;
    branchNames: string[];
  },
  context: TContext
): Promise<string> {
  const { branchName } = await context.prompts({
    type: 'text',
    name: 'branchName',
    message: `Choose a name for branch ${branchNames.length + 1}`,
    initial: getInitialNextBranchName(branchToSplit, branchNames),
    validate: (name) => {
      const calculatedName = replaceUnsupportedCharacters(name, context);
      return branchNames.includes(calculatedName) ||
        (calculatedName !== branchToSplit &&
          context.engine.allBranchNames.includes(calculatedName))
        ? 'Branch name is already in use, choose a different name.'
        : true;
    },
  });
  context.splog.newline();
  return replaceUnsupportedCharacters(branchName, context);
}

function getInitialNextBranchName(
  originalBranchName: string,
  branchNames: string[]
): string {
  return branchNames.includes(originalBranchName)
    ? getInitialNextBranchName(`${originalBranchName}_split`, branchNames)
    : originalBranchName;
}
