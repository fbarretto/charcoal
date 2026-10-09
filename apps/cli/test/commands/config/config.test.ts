import { expect } from 'chai';
import fs from 'fs-extra';
import { BasicScene } from '../../lib/scenes/basic_scene';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';
import { fakeGitSquashAndMerge } from '../../lib/utils/fake_squash_and_merge';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): config`, function () {
    configureTest(this, scene);

    it('Prints user and repo settings when non-interactive', () => {
      scene.repo.runCliCommand([`user`, `branch-prefix`, `--set`, `abc-`]);
      scene.repo.runCliCommand([`repo`, `remote`, `--set`, `upstream`]);
      const output = scene.repo.runCliCommandAndGetOutput([
        `config`,
        `--no-interactive`,
      ]);
      expect(output).to.contain('user branch-prefix: abc-');
      expect(output).to.contain('user tips: disabled');
      expect(output).to.contain('repo remote: upstream');
      expect(output).to.contain('repo github: disabled');
      expect(output).to.contain('repo github-stacks: enabled');
      expect(output).to.contain('user sync-auto-delete: disabled');
    });

    it('sync-auto-delete deletes merged branches during sync without prompting', () => {
      scene.repo.createChange('2', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');

      scene.repo.runCliCommand([`sync`, `--no-pull`, `--no-interactive`]);
      expectBranches(scene.repo, 'a, main');

      fs.writeJsonSync(scene.repo.userConfigPath, {
        ...fs.readJsonSync(scene.repo.userConfigPath),
        syncAutoDelete: true,
      });
      scene.repo.runCliCommand([`sync`, `--no-pull`, `--no-interactive`]);
      expectBranches(scene.repo, 'main');
    });
  });
}
