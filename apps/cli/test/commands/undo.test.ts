import { expect } from 'chai';
import { allScenes } from '../lib/scenes/all_scenes';
import { configureTest } from '../lib/utils/configure_test';
import { expectBranches } from '../lib/utils/expect_branches';
import { expectCommits } from '../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): undo`, function () {
    configureTest(this, scene);

    it('Prints a clear message when there is nothing to undo', () => {
      expect(scene.repo.runCliCommandAndGetOutput([`undo`, `-f`])).to.contain(
        'Nothing to undo'
      );
    });

    it('Removes a branch created by create', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expectBranches(scene.repo, 'a, main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'main');
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `for-each-ref`,
          `refs/branch-metadata/a`,
        ])
      ).to.equal('');
    });

    it('Removes a branch created by create --onto and returns to the original branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `--onto`, `a`]);
      expectBranches(scene.repo, 'a, c, main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Restores the previous sha and the restacked children after modify', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      const aBefore = scene.repo.getRef('refs/heads/a');
      const bBefore = scene.repo.getRef('refs/heads/b');

      scene.repo.checkoutBranch('a');
      scene.repo.runCliCommand([`modify`, `-m`, `a2`]);
      expect(scene.repo.getRef('refs/heads/b')).not.to.equal(bBefore);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(scene.repo.getRef('refs/heads/a')).to.equal(aBefore);
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bBefore);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, a, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'needs restack'
      );
    });

    it('Brings back a deleted branch and its metadata', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const aSha = scene.repo.getRef('refs/heads/a');
      const aMeta = scene.repo.getRef('refs/branch-metadata/a');

      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`delete`, `a`, `-f`]);
      expectBranches(scene.repo, 'main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.getRef('refs/heads/a')).to.equal(aSha);
      expect(scene.repo.getRef('refs/branch-metadata/a')).to.equal(aMeta);
      expect(scene.repo.currentBranchName()).to.equal('main');

      scene.repo.checkoutBranch('a');
      expect(scene.repo.runCliCommandAndGetOutput([`info`])).to.contain('main');
    });

    it('Steps back twice with two undos', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      expectBranches(scene.repo, 'a, b, main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'main');
      expect(scene.repo.currentBranchName()).to.equal('main');

      expect(scene.repo.runCliCommandAndGetOutput([`undo`, `-f`])).to.contain(
        'Nothing to undo'
      );
    });

    it('Does not record read-only commands', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.runCliCommand([`down`]);
      scene.repo.runCliCommand([`log`]);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'main');
    });
  });
}
