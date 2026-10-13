import chalk from 'chalk';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { TContextLite } from '../lib/context';
import { PreconditionsFailedError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { SKILL_MD } from '../generated/skill';

function skillDir(project: boolean): string {
  if (!project) {
    return path.join(os.homedir(), '.claude', 'skills', 'charcoal');
  }
  const root = runGitCommand({
    args: ['rev-parse', '--show-toplevel'],
    onError: 'ignore',
    resource: 'skillProjectRoot',
  });
  if (!root) {
    throw new PreconditionsFailedError(
      '`--project` installs into the current repository; run it inside one.'
    );
  }
  return path.join(root, '.claude', 'skills', 'charcoal');
}

export function installSkill(
  { project }: { project: boolean },
  context: TContextLite
): void {
  const file = path.join(skillDir(project), 'SKILL.md');
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8')
    : undefined;
  if (existing === SKILL_MD) {
    context.splog.info(`${chalk.cyan(file)} is already up to date.`);
    return;
  }
  fs.mkdirpSync(path.dirname(file));
  fs.writeFileSync(file, SKILL_MD);
  context.splog.info(
    `${
      existing === undefined ? 'Installed' : 'Updated'
    } the Charcoal skill at ${chalk.cyan(file)}.`
  );
}

export function printSkill(): void {
  process.stdout.write(SKILL_MD);
}
