import yargs from 'yargs';
import { graphite } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'parent';
export const canonical = 'parent';
export const description = "Print the current branch's parent.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    context.splog.info(
      context.engine.getParentPrecondition(
        context.engine.currentBranchPrecondition
      )
    )
  );
