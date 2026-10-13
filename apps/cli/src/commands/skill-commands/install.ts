import yargs from 'yargs';
import { installSkill } from '../../actions/skill';
import { graphiteWithoutRepo } from '../../lib/runner';

const args = {
  project: {
    describe:
      'Install for this project only: .claude/skills/ at the repository root (or the current folder outside a repository).',
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  global: {
    describe:
      'Install for all projects: ~/.claude/skills/. Without --project or --global, ch asks; without a terminal it installs globally.',
    demandOption: false,
    default: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'install';
export const canonical = 'skill install';
export const description =
  'Write the Charcoal skill for all projects (~/.claude/skills) or this project only (.claude/skills), replacing an older copy.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    installSkill({ project: argv.project, global: argv.global }, context)
  );
