import yargs from 'yargs';

export const command = 'internal-only <command>';
export const description = false;

export const builder = function (yargs: yargs.Argv): yargs.Argv {
  return yargs
    .commandDir('internal-only-commands', {
      extensions: ['js'],
    })
    .strict()
    .demandCommand();
};
