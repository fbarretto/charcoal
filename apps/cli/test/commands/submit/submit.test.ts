import { expect } from 'chai';
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

    it('is aliased as `s`', () => {
      scene.repo.runCliCommand([`s`, `--no-interactive`]);
      expect(created()).to.deep.equal(['a', 'b']);
    });
  });
}
