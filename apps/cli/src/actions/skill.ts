import chalk from 'chalk';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { TContextLite } from '../lib/context';
import { KilledError, PreconditionsFailedError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { SKILL_MD } from '../generated/skill';

type TScope = 'project' | 'global';

function skillDir(scope: TScope): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.claude', 'skills', 'charcoal');
  }
  // The repository root when inside one, otherwise the folder ch runs in.
  const root =
    runGitCommand({
      args: ['rev-parse', '--show-toplevel'],
      onError: 'ignore',
      resource: 'skillProjectRoot',
    }) || process.cwd();
  return path.join(root, '.claude', 'skills', 'charcoal');
}

async function chooseScope(
  { project, global }: { project: boolean; global: boolean },
  context: TContextLite
): Promise<TScope> {
  if (project && global) {
    throw new PreconditionsFailedError('Pass --project or --global, not both.');
  }
  if (project || global) {
    return project ? 'project' : 'global';
  }
  if (!context.interactive) {
    return 'global';
  }
  const answer = await context.prompts({
    type: 'select',
    name: 'value',
    message: 'Install the Charcoal skill for',
    choices: [
      {
        title: `All projects (${skillDir('global')})`,
        value: 'global',
      },
      {
        title: `This project only (${skillDir('project')})`,
        value: 'project',
      },
    ],
  });
  if (!answer.value) {
    throw new KilledError();
  }
  return answer.value as TScope;
}

export async function installSkill(
  opts: { project: boolean; global: boolean },
  context: TContextLite
): Promise<void> {
  const file = path.join(
    skillDir(await chooseScope(opts, context)),
    'SKILL.md'
  );
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
