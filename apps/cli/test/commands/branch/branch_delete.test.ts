import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';
import { deleteStackAction } from '../../../src/actions/delete_branch';
import { SCOPE } from '../../../src/lib/engine/scope_spec';
import { capturePrompts, choiceValues } from '../../lib/utils/capture_prompts';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): branch delete`, function () {
    configureTest(this, scene);

    it('Can run branch delete', () => {
      const branchName = 'a';

      scene.repo.createChangeAndCommit('2', '2');
      scene.repo.runCliCommand([`create`, branchName, `-m`, branchName]);
      expect(scene.repo.currentBranchName()).to.equal(branchName);

      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`delete`, branchName, `-f`]);
      expectBranches(scene.repo, 'main');
    });

    it('Restacks every child of a deleted branch onto its parent', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);

      scene.repo.runCliCommand([`delete`, `a`, `-f`]);
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, 1');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, 1');
    });

    const deleteInProcess = (
      answers: Array<string | boolean>,
      args: { branchName?: string; force?: boolean } = {}
    ) =>
      capturePrompts(scene, answers, (context) =>
        deleteStackAction(
          {
            force: false,
            close: false,
            scope: SCOPE.BRANCH,
            ...args,
          },
          context
        )
      );

    it('Requires a branch name in non-interactive mode', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(() =>
        scene.repo.runCliCommand([`delete`, `-f`, `--no-interactive`])
      ).to.throw();
      expectBranches(scene.repo, 'a, main');
    });

    it('Opens a selector when no name is given', async () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      const [selector] = await deleteInProcess(['a'], { force: true });
      expect(choiceValues(selector)).to.deep.equal(['a', 'b', 'main']);
      expectBranches(scene.repo, 'b, main');
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('Asks before deleting an unmerged branch', async () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');

      const declined = await deleteInProcess([false], { branchName: 'a' });
      expect(declined).to.have.length(1);
      expectBranches(scene.repo, 'a, main');

      await deleteInProcess([true], { branchName: 'a' });
      expectBranches(scene.repo, 'main');
    });

    it('Does not ask before deleting a merged branch', async () => {
      scene.repo.runCliCommand([`create`, `a`]);
      scene.repo.checkoutBranch('main');
      const prompts = await deleteInProcess([], { branchName: 'a' });
      expect(prompts).to.have.length(0);
      expectBranches(scene.repo, 'main');
    });

    it('Can delete a branch and its upstack', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);

      scene.repo.runCliCommand([`delete`, `b`, `--upstack`, `-f`]);
      expectBranches(scene.repo, 'a, d, main');
      expect(scene.repo.currentBranchName()).to.equal('d');
      expectCommits(scene.repo, 'd, a, 1');
    });

    it('Can delete a branch and its downstack, restacking children onto trunk', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);

      scene.repo.runCliCommand([`delete`, `b`, `--downstack`, `-f`]);
      expectBranches(scene.repo, 'c, d, main');
      expect(scene.repo.currentBranchName()).to.equal('d');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, 1');
    });

    it('Refuses to delete unmerged branches non-interactively without --force', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      expect(() =>
        scene.repo.runCliCommand([
          `delete`,
          `a`,
          `--upstack`,
          `--no-interactive`,
        ])
      ).to.throw(/a, b/);
      expectBranches(scene.repo, 'a, b, main');
    });

    it('Deletes a stack of safe branches without --force', () => {
      scene.repo.runCliCommand([`create`, `a`]);
      scene.repo.runCliCommand([`create`, `b`]);
      scene.repo.runCliCommand([
        `delete`,
        `a`,
        `--upstack`,
        `--no-interactive`,
      ]);
      expectBranches(scene.repo, 'main');
    });

    function expectParent(branch: string, parent: string): void {
      scene.repo.checkoutBranch(branch);
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal(parent);
    }

    // c and d both change b's file, so restacking either off b conflicts.
    // Whichever restacks second is queued behind the first conflict and must
    // still lose b's commits once `continue` reaches it.
    function buildConflictingChildren(): void {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'b');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('d', 'b');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('a');
    }

    function resolve(): void {
      expect(scene.repo.rebaseInProgress()).to.be.true;
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
    }

    function resolveBothConflicts(): void {
      resolve();
      expect(() => scene.repo.runCliCommand([`continue`])).to.throw();
      resolve();
      scene.repo.runCliCommand([`continue`]);
      expect(scene.repo.rebaseInProgress()).to.be.false;
    }

    it('Re-parents children queued behind a conflict after continue', () => {
      buildConflictingChildren();

      expect(() => scene.repo.runCliCommand([`delete`, `b`, `-f`])).to.throw();
      resolveBothConflicts();

      expectBranches(scene.repo, 'a, c, d, main');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, a, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, a, 1');
      expectParent('c', 'a');
      expectParent('d', 'a');
    });

    it('Re-parents children queued behind a conflict after a --downstack delete', () => {
      buildConflictingChildren();

      expect(() =>
        scene.repo.runCliCommand([`delete`, `b`, `--downstack`, `-f`])
      ).to.throw();
      resolveBothConflicts();

      expectBranches(scene.repo, 'c, d, main');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, 1');
      expectParent('c', 'main');
      expectParent('d', 'main');
    });

    it('Keeps the deleted branch when the restack is aborted', () => {
      buildConflictingChildren();

      expect(() => scene.repo.runCliCommand([`delete`, `b`, `-f`])).to.throw();
      scene.repo.runCliCommand([`abort`, `--force`]);

      expectBranches(scene.repo, 'a, b, c, d, main');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, b, a, 1');
      expectParent('c', 'b');
      expectParent('d', 'b');
    });

    it('Rejects --upstack together with --downstack', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(() =>
        scene.repo.runCliCommand([`delete`, `--upstack`, `--downstack`, `-f`])
      ).to.throw();
      expectBranches(scene.repo, 'a, main');
    });
  });
}
