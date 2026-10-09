#!/usr/bin/env node
/* eslint-disable no-console */

import chalk from 'chalk';
import tmp from 'tmp';
import yargs, { CommandModule } from 'yargs';
import { version } from '../package.json';
import { globalArgumentsOptions } from './lib/global_arguments';
import { getYargsInput } from './lib/pre-yargs/preprocess_command';
import { registerCommands } from './lib/register_commands';
import { registerCompletion } from './commands/completion';

import * as abort from './commands/abort';
import * as absorb from './commands/absorb';
import * as aliases from './commands/aliases';
import * as auth from './commands/auth';
import * as bottom from './commands/bottom';
import * as checkout from './commands/checkout';
import * as children from './commands/children';
import * as config from './commands/config';
import * as continueCmd from './commands/continue';
import * as create from './commands/create';
import * as deleteCmd from './commands/delete';
import * as demo from './commands/demo';
import * as dev from './commands/dev';
import * as down from './commands/down';
import * as edit from './commands/edit';
import * as feedback from './commands/feedback';
import * as fish from './commands/fish';
import * as fold from './commands/fold';
import * as freeze from './commands/freeze';
import * as get from './commands/get';
import * as info from './commands/info';
import * as init from './commands/init';
import * as ll from './commands/ll';
import * as log from './commands/log';
import * as ls from './commands/ls';
import * as merge from './commands/merge';
import * as modify from './commands/modify';
import * as move from './commands/move';
import * as parent from './commands/parent';
import * as pop from './commands/pop';
import * as pr from './commands/pr';
import * as rename from './commands/rename';
import * as reorder from './commands/reorder';
import * as repo from './commands/repo';
import * as restack from './commands/restack';
import * as revert from './commands/revert';
import * as split from './commands/split';
import * as squash from './commands/squash';
import * as submit from './commands/submit';
import * as sync from './commands/sync';
import * as test from './commands/test';
import * as top from './commands/top';
import * as track from './commands/track';
import * as undo from './commands/undo';
import * as trunk from './commands/trunk';
import * as unfreeze from './commands/unfreeze';
import * as unlink from './commands/unlink';
import * as unstack from './commands/unstack';
import * as untrack from './commands/untrack';
import * as up from './commands/up';
import * as user from './commands/user';

// this line gets rid of warnings about "experimental fetch API" for our users
// while still showing us warnings when we test with DEBUG=1
if (!process.env.DEBUG) {
  process.removeAllListeners('warning');
}

// https://www.npmjs.com/package/tmp#graceful-cleanup
tmp.setGracefulCleanup();

process.on('uncaughtException', (err) => {
  console.log(chalk.redBright(`UNCAUGHT EXCEPTION: ${err.message}`));
  console.log(chalk.redBright(`UNCAUGHT EXCEPTION: ${err.stack}`));
  // eslint-disable-next-line no-restricted-syntax
  process.exit(1);
});

// Registered explicitly (not via `.commandDir()`) so the command modules are
// bundled into the single-file binary built with `bun build --compile`.
const commandModules = [
  abort,
  absorb,
  aliases,
  auth,
  bottom,
  checkout,
  children,
  config,
  continueCmd,
  create,
  deleteCmd,
  demo,
  dev,
  down,
  edit,
  feedback,
  fish,
  fold,
  freeze,
  get,
  info,
  init,
  ll,
  log,
  ls,
  merge,
  modify,
  move,
  parent,
  pop,
  pr,
  rename,
  reorder,
  repo,
  restack,
  revert,
  split,
  squash,
  submit,
  sync,
  test,
  top,
  track,
  undo,
  trunk,
  unfreeze,
  unlink,
  unstack,
  untrack,
  up,
  user,
] as unknown as CommandModule[];

const builtinNames = [
  'completion',
  ...commandModules.flatMap((m) => [
    String(m.command).split(' ')[0],
    ...[m.aliases ?? []].flat(),
  ]),
];

const cli = registerCompletion(
  registerCommands(yargs(getYargsInput(builtinNames)), commandModules)
);

void cli
  // Pin the program name; yargs otherwise derives it from the process, which is
  // the runtime ("bun") in the compiled single-file binary, or "index.js" under
  // node.
  .scriptName('ch')
  .help()
  .showHidden('show-hidden', 'Show hidden options too (`--help --all`).')
  // Pin to the bundled version; yargs' default resolves package.json relative
  // to the cwd, which is wrong in the single-file binary / outside apps/cli.
  .version(version)
  .usage(
    'Charcoal is a command line tool that makes working with stacked changes fast & intuitive.\n\nhttps://docs.graphite.dev/guides/graphite-cli'
  )
  .options(globalArgumentsOptions)
  .global(Object.keys(globalArgumentsOptions))
  .strict()
  .demandCommand().argv;
