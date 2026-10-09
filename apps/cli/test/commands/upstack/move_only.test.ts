import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): move --only`, function () {
    configureTest(this, scene);

    function expectParent(branch: string, parent: string): void {
      scene.repo.checkoutBranch(branch);
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal(parent);
    }

    it('Moves only the source branch, leaving its child on the old parent', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');

      scene.repo.runCliCommand([
        `move`,
        `--only`,
        `--source`,
        `b`,
        `--onto`,
        `main`,
      ]);
      expect(scene.repo.currentBranchName()).to.equal('a');

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, a, 1');
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, 1');

      expectParent('c', 'a');
      expectParent('b', 'main');
    });

    it('Moves only the current branch, restacking both children and grandchildren', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.createChange('e', 'e');
      scene.repo.runCliCommand([`create`, `e`, `-m`, `e`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');

      scene.repo.runCliCommand([`move`, `--only`, `main`]);

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, a, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, a, 1');
      scene.repo.checkoutBranch('e');
      expectCommits(scene.repo, 'e, c, a, 1');
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, 1');

      expectParent('c', 'a');
      expectParent('d', 'a');
      expectParent('e', 'c');
      expectParent('b', 'main');
    });

    it('Can move the source onto its former child', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');

      scene.repo.runCliCommand([`move`, `--only`, `c`]);

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, c, a, 1');
      expectParent('b', 'c');
      expectParent('c', 'a');
    });

    it('Refuses to move a branch onto itself', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(() =>
        scene.repo.runCliCommand([`move`, `--only`, `a`])
      ).to.throw();
    });

    it('Can continue after a conflict restacking a child', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'b');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');

      expect(() =>
        scene.repo.runCliCommand([`move`, `--only`, `main`])
      ).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand([`continue`]);
      expect(scene.repo.rebaseInProgress()).to.be.false;

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, a, 1');
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, 1');
      expectParent('c', 'a');
      expectParent('b', 'main');
    });

    it('Re-parents siblings queued behind a conflict only once they restack', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'b');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');

      expect(() =>
        scene.repo.runCliCommand([`move`, `--only`, `main`])
      ).to.throw();
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand([`continue`]);

      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, a, 1');
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, 1');
      expectParent('c', 'a');
      expectParent('d', 'a');
      expectParent('b', 'main');
    });
  });
}
