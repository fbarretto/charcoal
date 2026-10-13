import chalk from 'chalk';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import { TContextLite } from '../lib/context';
import { ExitFailedError } from '../lib/errors';

const UPGRADE_COMMANDS = {
  homebrew: ['brew', 'upgrade', 'charcoal'],
  npm: ['npm', 'i', '-g', '@fbarretto/charcoal'],
} as const;

type TInstall = keyof typeof UPGRADE_COMMANDS | 'unknown';

// The compiled binary is execPath itself; under node, ch is the script node runs.
export function detectInstall({
  execPath,
  scriptPath,
}: {
  execPath: string;
  scriptPath: string | undefined;
}): TInstall {
  if (/\/Cellar\/charcoal\//.test(execPath)) {
    return 'homebrew';
  }
  if (scriptPath && /\/node_modules\/(@[^/]+\/)?charcoal\//.test(scriptPath)) {
    return 'npm';
  }
  return 'unknown';
}

const realpath = (p: string | undefined) => {
  try {
    return p && fs.realpathSync(p);
  } catch {
    return p;
  }
};

export function upgradeAction(context: TContextLite): void {
  const install = detectInstall({
    execPath: realpath(process.execPath) ?? process.execPath,
    scriptPath: realpath(process.argv[1]),
  });
  if (install === 'unknown') {
    context.splog.info(
      [
        "Couldn't tell how ch was installed. Upgrade it with one of:",
        `  ${chalk.cyan(UPGRADE_COMMANDS.homebrew.join(' '))}   (Homebrew)`,
        `  ${chalk.cyan(UPGRADE_COMMANDS.npm.join(' '))}   (npm)`,
        'or download the latest binary from https://github.com/fbarretto/charcoal/releases/latest.',
      ].join('\n')
    );
    return;
  }
  const [command, ...args] = UPGRADE_COMMANDS[install];
  context.splog.info(`Running ${chalk.cyan([command, ...args].join(' '))}...`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new ExitFailedError(`\`${[command, ...args].join(' ')}\` failed.`);
  }
}
