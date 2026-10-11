import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): commit create`, function () {
    configureTest(this, scene);

    it('Can create a commit', () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `2`]);

      expect(scene.repo.currentBranchName()).to.equal('a');
      expectCommits(scene.repo, '2, 1');
    });

    it('Restacks upwards with unrelated unstaged changes left in place', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.createChange('z', 'z');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('a2', 'a');
      scene.repo.createChange('z2', 'z', true);

      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a2`]);

      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('M z_test.txt');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'needs restack'
      );
    });

    it('Can create a commit with a multi-word commit message', () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a b c`]);

      expect(scene.repo.currentBranchName()).to.equal('a');
      expectCommits(scene.repo, 'a b c');
    });

    it('Fails to create a commit if there are no staged changes', () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      expect(() =>
        scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a`])
      ).to.throw(Error);
    });

    it('Automatically restacks upwards', () => {
      scene.repo.createChange('2', '2');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `2`]);

      scene.repo.createChange('3', '3');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `3`]);

      scene.repo.checkoutBranch('a');
      scene.repo.createChange('2.5', '2.5');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `2.5`]);

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, '3, 2.5, 2, 1');
    });
  });
}
