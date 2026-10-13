import yargs from 'yargs';
import { installSkill } from '../../actions/skill';
import { graphiteWithoutRepo } from '../../lib/runner';

const args = {
  project: {
    describe:
      "Install into this repository's .claude/skills/ instead of ~/.claude/skills/.",
    demandOption: false,
    default: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'install';
export const canonical = 'skill install';
export const description =
  'Write the Charcoal skill to ~/.claude/skills/charcoal/SKILL.md (or the repo with --project), replacing an older copy.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    installSkill({ project: argv.project }, context)
  );
