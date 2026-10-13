import yargs from 'yargs';
import { printSkill } from '../../actions/skill';
import { graphiteWithoutRepo } from '../../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'print';
export const canonical = 'skill print';
export const description = 'Print the Charcoal skill (SKILL.md) to stdout.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async () => printSkill());
