import { expect } from 'chai';
import prompts from 'prompts';
import { submitAction } from '../../../src/actions/submit/submit_action';
import { initContext, initContextLite } from '../../../src/lib/context';
import { SCOPE } from '../../../src/lib/engine/scope_spec';
import { composeGit } from '../../../src/lib/git/git';
import { CloneScene } from '../../lib/scenes/clone_scene';
import { configureTest } from '../../lib/utils/configure_test';
import { FakeGh } from '../../lib/utils/fake_gh';

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): submit`, function () {
    configureTest(this, scene);
    const gh = new FakeGh();

    beforeEach(() => {
      gh.install();
      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
      ['a', 'b'].forEach((n) => {
        scene.repo.createChange(n, n);
        scene.repo.runCliCommand([`create`, n, `-m`, n]);
      });
    });
    afterEach(() => gh.uninstall());

    const submit = (...flags: string[]) =>
      scene.repo.runCliCommandAndGetOutput([
        `submit`,
        `--no-interactive`,
        ...flags,
      ]);
    const created = () =>
      gh
        .calls()
        .filter((c) => c.startsWith('pr create'))
        .map((c) => / --head (\S+)/.exec(c)?.[1]);

    it('submits from --branch instead of the current branch', () => {
      submit(`--branch`, `a`);
      expect(created()).to.deep.equal(['a']);
    });

    it('rejects an unknown --branch', () => {
      expect(() =>
        scene.repo.runCliCommand([
          `submit`,
          `--no-interactive`,
          `--branch`,
          `nope`,
        ])
      ).to.throw(/Could not find branch nope/);
    });

    it('keeps explicit reviewers and team reviewers in non-interactive mode', () => {
      submit(`-r`, `alice, bob`, `-t`, `core,other-org/ops`);
      expect(gh.calls().filter((c) => c.startsWith('pr create'))[0]).to.match(
        /--reviewer alice --reviewer bob --reviewer owner\/core --reviewer other-org\/ops$/
      );
    });

    it('asks whether reviewers apply to existing PRs too', async () => {
      submit(`--branch`, `a`);
      gh.clearCalls();
      prompts.inject(['new']);
      await submitAction(
        {
          scope: SCOPE.DOWNSTACK,
          editPRFieldsInline: false,
          draft: false,
          publish: true,
          dryRun: false,
          updateOnly: false,
          reviewers: 'carol',
          confirm: false,
          forcePush: false,
          select: false,
          always: true,
          branch: undefined,
        },
        initContext(
          initContextLite({ interactive: true, quiet: true }),
          composeGit(),
          { verify: false }
        )
      );
      const calls = gh.calls();
      expect(calls.filter((c) => c.includes('carol'))).to.deep.equal([
        'pr create --repo owner/name --head b --base a --title b --body  --reviewer carol',
      ]);
    });

    it('is aliased as `s`', () => {
      scene.repo.runCliCommand([`s`, `--no-interactive`]);
      expect(created()).to.deep.equal(['a', 'b']);
    });
  });
}
