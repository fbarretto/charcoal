import { Argv, CommandModule } from 'yargs';

export const SHOW_HIDDEN_OPTION = 'show-hidden';
export const SHOW_HIDDEN_DESCRIPTION =
  'Show hidden options too (`--help --all`).';

// Register command modules explicitly instead of yargs' `.commandDir()`, which
// scans the filesystem at runtime and therefore breaks inside a single-file
// (bun --compile) binary. Static `.command()` calls are bundler-visible.
//
// The modules are heterogeneous (each handler has its own args type), so they
// can't share one `CommandModule<T, U>` instantiation — hence the loose input.
//
// yargs drops the `.showHidden()` setting when it enters a subcommand, so each
// command re-registers it for `ch <cmd> --help --show-hidden` to work.
export function registerCommands(
  yargs: Argv,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules: readonly any[]
): Argv {
  return modules.reduce(
    (acc, mod) =>
      acc.command({
        ...mod,
        builder: (y: Argv) =>
          (typeof mod.builder === 'function'
            ? mod.builder(y)
            : y.options(mod.builder ?? {})
          ).showHidden(SHOW_HIDDEN_OPTION, SHOW_HIDDEN_DESCRIPTION),
      } as CommandModule),
    yargs
  );
}
