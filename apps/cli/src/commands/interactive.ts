import yargs from 'yargs';

export const command = 'interactive <command>';
export const description = false;

export const builder = function (yargs: yargs.Argv): yargs.Argv {
  return yargs
    .commandDir('interactive-commands', {
      extensions: ['js'],
    })
    .strict()
    .demandCommand();
};
