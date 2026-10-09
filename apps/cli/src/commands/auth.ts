import yargs from 'yargs';
import { graphiteWithoutRepo } from '../lib/runner';
import { execFileSync } from 'child_process';
import { TContextLite } from '../lib/context';
import { ExitFailedError } from '../lib/errors';

const args = {
  token: {
    type: 'string',
    alias: 't',
    describe:
      'A GitHub token to store via `gh auth login --with-token` (never printed).',
    demandOption: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'auth';
export const description =
  'Authenticate with the GitHub CLI to create and manage PRs in GitHub from Charcoal.';
export const builder = args;
export const canonical = 'auth';

const MIN_GH_VERSION = '2.0.0';

export const handler = async (argv: argsT): Promise<void> => {
  return graphiteWithoutRepo(argv, canonical, async (context) => {
    const ghVersion = getGhVersion();

    if (!ghVersion || ghVersion < MIN_GH_VERSION) {
      context.splog.message(
        `❌ Please install GitHub CLI version ${MIN_GH_VERSION} or higher.`
      );
      return;
    }

    if (argv.token) {
      loginWithToken(argv.token, context);
      return;
    }

    const isGhAuthorized = getGithubAuthorizationStatus();

    if (isGhAuthorized) {
      context.splog.message('✅ Already authenticated with GitHub.');
      return;
    }

    context.splog.message(
      '❌ Charcoal is not authenticated with GitHub. Please authenticate.'
    );

    try {
      execFileSync('gh', ['auth', 'login'], {
        stdio: 'inherit',
      });

      context.splog.message(
        '✅ Successfully authenticated Charcoal with GitHub.'
      );
    } catch {
      context.splog.message(
        '❌ Failed to authenticate Charcoal with GitHub. Please try again.'
      );
    }
  });
};

function loginWithToken(token: string, context: TContextLite): void {
  try {
    execFileSync('gh', ['auth', 'login', '--with-token'], {
      input: token,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch {
    throw new ExitFailedError(
      '❌ `gh auth login --with-token` rejected the token.'
    );
  }
  context.splog.message('✅ Successfully authenticated Charcoal with GitHub.');
}

export const getGhVersion = (): string | null => {
  try {
    const output = execFileSync('gh', ['--version']).toString();
    const match = output.match(/gh version (\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
};

export const isGhInstalled = (): boolean => getGhVersion() !== null;

export const getGithubAuthorizationStatus = (): boolean => {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
