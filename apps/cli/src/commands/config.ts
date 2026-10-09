import chalk from 'chalk';
import prompts from 'prompts';
import yargs from 'yargs';
import { TContextLite } from '../lib/context';
import { graphiteWithoutRepo } from '../lib/runner';
import { repoConfigFactory, TRepoConfig } from '../lib/spiffy/repo_config_spf';
import { TUserConfig } from '../lib/spiffy/user_config_spf';
import {
  getBranchDateEnabled,
  getBranchReplacement,
  setBranchPrefix,
} from '../lib/utils/branch_name';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'config';
export const canonical = 'config';
export const description =
  'Interactively view and edit the settings managed by `ch user` and `ch repo`. Prints them when non-interactive.';
export const builder = args;

type TSetting = {
  name: string;
  get: () => string;
  // A text prompt, a yes/no toggle, or a fixed list of choices.
  input: 'text' | 'toggle' | { title: string; value: string }[];
  set: (value: string | boolean) => void;
};

const onOff = (b: boolean | undefined) => (b ? 'enabled' : 'disabled');

function userSettings(context: TContextLite): TSetting[] {
  const user: TUserConfig = context.userConfig;
  const toggle = (
    name: string,
    get: () => boolean | undefined,
    set: (v: boolean) => void
  ): TSetting => ({
    name,
    get: () => onOff(get()),
    input: 'toggle',
    set: (v) => set(v as boolean),
  });
  return [
    {
      name: 'user branch-prefix',
      get: () => user.data.branchPrefix || '(none)',
      input: 'text',
      set: (v) => setBranchPrefix(v as string, context),
    },
    toggle(
      'user branch-date',
      () => getBranchDateEnabled(context),
      (v) => user.update((d) => (d.branchDate = v))
    ),
    {
      name: 'user branch-replacement',
      get: () => JSON.stringify(getBranchReplacement(context)),
      input: [
        { title: 'underscore (_)', value: '_' },
        { title: 'dash (-)', value: '-' },
        { title: 'empty (remove)', value: '' },
      ],
      set: (v) =>
        user.update((d) => (d.branchReplacement = v as '_' | '-' | '')),
    },
    {
      name: 'user editor',
      get: () => user.data.editor || `(git default: ${user.getEditor()})`,
      input: 'text',
      set: (v) => user.update((d) => (d.editor = (v as string) || undefined)),
    },
    {
      name: 'user pager',
      get: () =>
        user.data.pager === ''
          ? '(disabled)'
          : user.data.pager || `(git default: ${user.getPager() ?? 'none'})`,
      input: 'text',
      set: (v) => user.update((d) => (d.pager = (v as string) || undefined)),
    },
    toggle(
      'user restack-date',
      () => user.data.restackCommitterDateIsAuthorDate,
      (v) => user.update((d) => (d.restackCommitterDateIsAuthorDate = v))
    ),
    toggle(
      'user submit-body',
      () => user.data.submitIncludeCommitMessages,
      (v) => user.update((d) => (d.submitIncludeCommitMessages = v))
    ),
    toggle(
      'user sync-auto-delete',
      () => user.data.syncAutoDelete,
      (v) => user.update((d) => (d.syncAutoDelete = v))
    ),
    toggle(
      'user tips',
      () => user.data.tips,
      (v) => user.update((d) => (d.tips = v))
    ),
  ];
}

function repoSettings(repo: TRepoConfig): TSetting[] {
  const safe = (get: () => string) => () => {
    try {
      return get();
    } catch {
      return '(unknown)';
    }
  };
  return [
    {
      name: 'repo name',
      get: safe(repo.getRepoName),
      input: 'text',
      set: (v) => repo.update((d) => (d.name = (v as string) || undefined)),
    },
    {
      name: 'repo owner',
      get: safe(repo.getRepoOwner),
      input: 'text',
      set: (v) => repo.update((d) => (d.owner = (v as string) || undefined)),
    },
    {
      name: 'repo remote',
      get: repo.getRemote,
      input: 'text',
      set: (v) => repo.setRemote((v as string) || 'origin'),
    },
    {
      name: 'repo github',
      get: () => onOff(repo.getIsGithubIntegrationEnabled()),
      input: 'toggle',
      set: (v) => repo.setIsGithubIntegrationEnabled(v as boolean),
    },
    {
      name: 'repo github-stacks',
      get: () => onOff(repo.getGithubStacks()),
      input: 'toggle',
      set: (v) => repo.setGithubStacks(v as boolean),
    },
  ];
}

function loadRepoConfig(): TRepoConfig | undefined {
  try {
    return repoConfigFactory.load();
  } catch {
    return undefined; // not in a git repo: only user settings apply
  }
}

function valuePrompt(setting: TSetting): prompts.PromptObject {
  const message = `New value for ${setting.name}`;
  if (setting.input === 'text') {
    return { type: 'text', name: 'value', message };
  }
  if (setting.input === 'toggle') {
    return {
      type: 'toggle',
      name: 'value',
      message,
      active: 'on',
      inactive: 'off',
    };
  }
  return { type: 'select', name: 'value', message, choices: setting.input };
}

export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) => {
    const repo = loadRepoConfig();
    const settings = [
      ...userSettings(context),
      ...(repo ? repoSettings(repo) : []),
    ];

    if (!context.interactive) {
      context.splog.info(
        settings.map((s) => `${s.name}: ${s.get()}`).join('\n')
      );
      return;
    }

    const { name } = await context.prompts({
      type: 'select',
      name: 'name',
      message: 'Which setting would you like to change?',
      choices: settings.map((s) => ({
        title: `${s.name} ${chalk.gray(`(${s.get()})`)}`,
        value: s.name,
      })),
    });
    const setting = settings.find((s) => s.name === name);
    if (!setting) {
      return;
    }
    const { value } = await context.prompts(valuePrompt(setting));
    setting.set(value);
    context.splog.info(`${setting.name} is now ${chalk.cyan(setting.get())}`);
  });
