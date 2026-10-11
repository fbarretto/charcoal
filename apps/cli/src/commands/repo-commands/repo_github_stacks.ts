import yargs from 'yargs';
import { graphite } from '../../lib/runner';

const args = {
  enable: {
    default: false,
    type: 'boolean',
    describe: 'Link submitted PRs as a GitHub stack by default.',
  },
  disable: {
    default: false,
    type: 'boolean',
    describe: "Don't link submitted PRs as a GitHub stack by default.",
  },
} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'github-stacks';
export const canonical = 'repo github-stacks';
export const description =
  'Whether `ch submit` links PRs as a GitHub stack by default (on). Prints the setting with no flag.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) => {
    if (argv.enable || argv.disable) {
      context.repoConfig.setGithubStacks(argv.enable);
    }
    context.splog.info(
      `GitHub stacks are ${
        context.repoConfig.getGithubStacks() ? 'enabled' : 'disabled'
      } for this repo.`
    );
  });
