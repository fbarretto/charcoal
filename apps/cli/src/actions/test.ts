import chalk from 'chalk';
import cp from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { TContext } from '../lib/context';
import { TScopeSpec } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';

type TTestStatus =
  | '[pending]'
  | '[success]'
  | '[failed]'
  | '[running]'
  | '[killed]';

type TTestState = {
  [branchName: string]: {
    status: TTestStatus;
    duration: number | undefined;
    outfile: string | undefined;
  };
};

export function testStack(
  opts: { scope: TScopeSpec; includeTrunk?: boolean; command: string },
  context: TContext
): void {
  const currentBranch = context.engine.currentBranchPrecondition;
  // Get branches to test.
  const branches = context.engine
    .getRelativeStack(currentBranch, opts.scope)
    .filter((branch) => opts.includeTrunk || !context.engine.isTrunk(branch));

  // Initialize state to print out.
  const state: TTestState = {};
  branches.forEach((b) => {
    state[b] = { status: '[pending]', duration: undefined, outfile: undefined };
  });

  // Create a tmp output directory for debugging.
  const tmpDirName = tmp.dirSync().name;

  // Redraw the table in place only on a TTY; otherwise print it once at the end.
  const live = !!process.stdout.isTTY;
  if (live) {
    logState(state, false, context);
  }
  branches.forEach((branchName) =>
    testBranch(
      { command: opts.command, branchName, tmpDirName, state, live },
      context
    )
  );
  if (!live) {
    logState(state, false, context);
  }

  context.splog.info(`Output files: ${chalk.gray(tmpDirName)}`);

  // Finish off.
  context.engine.checkoutBranch(currentBranch);

  const failed = branches.filter((b) =>
    ['[failed]', '[killed]'].includes(state[b].status)
  );
  if (failed.length) {
    throw new ExitFailedError(`The command failed on: ${failed.join(', ')}.`);
  }
}

function testBranch(
  opts: {
    state: TTestState;
    branchName: string;
    command: string;
    tmpDirName: string;
    live: boolean;
  },
  context: TContext
) {
  context.engine.checkoutBranch(opts.branchName);

  const outputPath = path.join(
    opts.tmpDirName,
    opts.branchName.replaceAll(path.sep, '-')
  );

  // Mark the branch as running.
  opts.state[opts.branchName].status = '[running]';
  if (opts.live) {
    logState(opts.state, true, context);
  }

  const startTime = Date.now();

  try {
    const out = cp.execSync(opts.command, { encoding: 'utf-8' });
    fs.writeFileSync(outputPath, out);
    opts.state[opts.branchName].status = '[success]';
  } catch (e) {
    if (e?.signal) {
      fs.writeFileSync(outputPath, [e.stdout, e.stderr, e.signal].join('\n'));
      opts.state[opts.branchName].status = '[killed]';
    } else if (e?.status) {
      fs.writeFileSync(outputPath, [e.stdout, e.stderr, e.status].join('\n'));
      opts.state[opts.branchName].status = '[failed]';
    } else {
      throw e;
    }
  }

  opts.state[opts.branchName].duration = Date.now() - startTime;
  opts.state[opts.branchName].outfile = outputPath;

  if (opts.live) {
    logState(opts.state, true, context);
  }
}

function logState(state: TTestState, refresh: boolean, context: TContext) {
  if (refresh) {
    process.stdout.moveCursor(0, -Object.keys(state).length);
  }
  Object.keys(state).forEach((branchName) => {
    const color: (arg0: string) => string =
      state[branchName].status === '[failed]' ||
      state[branchName].status === '[killed]'
        ? chalk.red
        : state[branchName].status === '[success]'
        ? chalk.green
        : state[branchName].status === '[running]'
        ? chalk.cyan
        : chalk.grey;
    const duration = state[branchName].duration;
    const durationString: string | undefined = duration
      ? new Date(duration).toISOString().split(/T/)[1].replace(/\..+/, '')
      : undefined;
    if (refresh) {
      process.stdout.clearLine(0);
    }
    // Example:
    // - [success]: tr--Track_CLI_and_Graphite_user_assoicat (00:00:22)
    context.splog.info(
      `- ${color(state[branchName].status)}: ${branchName}${
        duration ? ` (${durationString})` : ''
      }`
    );
  });
}
