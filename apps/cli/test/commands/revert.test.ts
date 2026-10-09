import { expect } from 'chai';
import { allScenes } from '../lib/scenes/all_scenes';
import { configureTest } from '../lib/utils/configure_test';
import { expectBranches } from '../lib/utils/expect_branches';

for (const scene of allScenes) {
  describe(`(${scene}): revert`, function () {
    configureTest(this, scene);

    it('Creates a branch off trunk that reverts a trunk commit', () => {
      scene.repo.createChangeAndCommit('2', '2');
      const sha = scene.repo.runGitCommandAndGetOutput([`rev-parse`, `HEAD`]);
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.runCliCommand([`revert`, sha]);
      const branch = scene.repo.currentBranchName();
      expect(branch).to.contain('revert');
      expect(
        scene.repo.runGitCommandAndGetOutput([`log`, `-1`, `--format=%s`])
      ).to.equal('Revert "2"');
      expect(
        scene.repo.runGitCommandAndGetOutput([`rev-parse`, `HEAD^`])
      ).to.equal(sha);
      expect(
        scene.repo.runGitCommandAndGetOutput([`ls-files`, `2_test.txt`])
      ).to.equal('');

      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Refuses a commit that is not on trunk', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const sha = scene.repo.runGitCommandAndGetOutput([`rev-parse`, `HEAD`]);

      expect(() => scene.repo.runCliCommand([`revert`, sha])).to.throw(
        /not a commit on main/
      );
      expect(() => scene.repo.runCliCommand([`revert`, `nope`])).to.throw(
        /not a commit on main/
      );
      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it('Changes nothing when the revert conflicts', () => {
      scene.repo.createChangeAndCommit('2', '2');
      const sha = scene.repo.runGitCommandAndGetOutput([`rev-parse`, `HEAD`]);
      scene.repo.createChangeAndCommit('3', '2');
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      expect(() => scene.repo.runCliCommand([`revert`, sha])).to.throw();
      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('');
    });

    it('Is undone by undo', () => {
      scene.repo.createChangeAndCommit('2', '2');
      const sha = scene.repo.runGitCommandAndGetOutput([`rev-parse`, `HEAD`]);
      scene.repo.runCliCommand([`revert`, sha]);
      expect(scene.repo.currentBranchName()).not.to.equal('main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'main');
      expect(scene.repo.currentBranchName()).to.equal('main');
    });
  });
}
