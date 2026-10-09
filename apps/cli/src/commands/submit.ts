import yargs from 'yargs';
import { submitAction } from '../actions/submit/submit_action';
import { SCOPE } from '../lib/engine/scope_spec';
import { graphite } from '../lib/runner';

const args = {
  stack: {
    describe:
      'Submit the current branch and all of its descendants, in addition to its ancestors.',
    type: 'boolean',
    default: false,
    alias: 's',
  },
  draft: {
    describe:
      'If set, marks PR as draft. If --no-interactive is true, new PRs will be created in draft mode.',
    type: 'boolean',
    default: false,
    alias: 'd',
  },
  publish: {
    describe:
      'If set, publishes PR. If --no-interactive is true, new PRs will be created in draft mode.',
    type: 'boolean',
    default: false,
    alias: 'p',
  },
  edit: {
    describe:
      'Edit PR fields inline. If --no-interactive is true, this is automatically set to false.',
    type: 'boolean',
    alias: 'e',
  },
  'no-edit': {
    type: 'boolean',
    describe: "Don't edit PR fields inline. Takes precedence over --edit",
    demandOption: false,
    default: false,
    alias: 'n',
  },
  'edit-title': {
    describe:
      'Input the PR title interactively. Default only prompts for new PRs. Takes precedence over --no-edit. --no-edit-title skips the prompt and takes precedence over --edit-title and --edit.',
    type: 'boolean',
  },
  'edit-description': {
    describe:
      'Input the PR description interactively. Default only prompts for new PRs. Takes precedence over --no-edit. --no-edit-description skips the prompt and takes precedence over --edit-description and --edit.',
    type: 'boolean',
  },
  reviewers: {
    describe:
      'If set without an argument, prompt to manually set reviewers. Alternatively, accepts a comma separated string of reviewers',
    type: 'string',
    alias: 'r',
  },
  'team-reviewers': {
    describe:
      'Comma separated list of team slugs (or org/slug). Opens the reviewers prompt if set without an argument.',
    type: 'string',
    alias: 't',
  },
  'dry-run': {
    describe:
      'Reports the PRs that would be submitted and terminates. No branches are pushed and no PRs are opened or updated.',
    type: 'boolean',
    default: false,
  },
  confirm: {
    describe:
      'Reports the PRs that would be submitted and asks for confirmation before pushing branches and opening/updating PRs. If either of --no-interactive or --dry-run is passed, this flag is ignored.',
    type: 'boolean',
    default: false,
    alias: 'c',
  },
  select: {
    describe:
      'Reports the PRs that would be submitted and asks the user to select which should be updated/created. If either of --no-interactive or --dry-run is passed, this flag is ignored.',
    type: 'boolean',
    default: false,
  },
  'update-only': {
    describe: 'Only update the PRs that have been already been submitted.',
    type: 'boolean',
    default: false,
    alias: 'u',
  },
  force: {
    describe:
      'Force push: overwrites the remote branch with your local branch. Otherwise defaults to --force-with-lease.',
    type: 'boolean',
    default: false,
    alias: 'f',
  },
  always: {
    describe:
      'Always push updates, even if the branch has not changed. Can be helpful for fixing an inconsistent Charcoal stack view on Web/GitHub resulting from downtime/a bug.',
    type: 'boolean',
    default: false,
  },
  'gh-stack': {
    describe:
      'Link the submitted PRs as a GitHub stack (default: the `repo github-stacks` setting, on by default). Pass --no-gh-stack to skip.',
    type: 'boolean',
  },
  comment: {
    describe: 'Add a comment with the given message to every submitted PR.',
    type: 'string',
  },
  'merge-when-ready': {
    describe:
      'Enable auto-merge (`gh pr merge --auto --squash`) on every submitted PR, so each merges once its requirements are met.',
    type: 'boolean',
    default: false,
    alias: 'm',
  },
  'rerequest-review': {
    describe: 'Re-request review from current reviewers on updated PRs.',
    type: 'boolean',
    default: false,
  },
  view: {
    describe: 'Open the PR in your browser after submitting.',
    type: 'boolean',
    default: false,
    alias: 'v',
  },
  cli: {
    describe:
      'Edit PR metadata via the CLI. Always the case in Charcoal; accepted for gt compatibility.',
    type: 'boolean',
  },
  branch: {
    describe: 'Which branch to run this command from (default: current branch)',
    type: 'string',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'submit';
export const canonical = 'submit';
export const aliases = ['s'];
export const description =
  'Idempotently force push all branches from trunk to the current branch to GitHub, creating or updating distinct pull requests for each. Pass --stack to also submit descendants of the current branch.';
export const builder = args;
// true: always prompt; false: never; undefined: prompt for new PRs only.
const editMode = (
  field: boolean | undefined,
  argv: argsT
): boolean | undefined => field ?? (argv['no-edit'] ? false : argv.edit);

export const handler = async (argv: argsT): Promise<void> => {
  await graphite(argv, canonical, async (context) => {
    await submitAction(
      {
        scope: argv.stack ? SCOPE.STACK : SCOPE.DOWNSTACK,
        editTitle: editMode(argv['edit-title'], argv),
        editDescription: editMode(argv['edit-description'], argv),
        draft: argv.draft,
        publish: argv.publish,
        dryRun: argv['dry-run'],
        updateOnly: argv['update-only'],
        reviewers: argv.reviewers,
        teamReviewers: argv['team-reviewers'],
        confirm: argv.confirm,
        forcePush: argv.force,
        select: argv.select,
        always: argv.always,
        branch: argv.branch,
        ghStack: argv['gh-stack'],
        comment: argv.comment,
        mergeWhenReady: argv['merge-when-ready'],
        rerequestReview: argv['rerequest-review'],
        view: argv.view,
      },
      context
    );
  });
};
