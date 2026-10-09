import yargs from 'yargs';
import { graphite } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'children';
export const canonical = 'children';
export const description = "Print the current branch's children, one per line.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    context.engine
      .getChildren(context.engine.currentBranchPrecondition)
      .forEach((child) => context.splog.info(child))
  );
