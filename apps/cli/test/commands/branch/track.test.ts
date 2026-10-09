import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { trackBranch } from '../../../src/actions/track_branch';
import { capturePrompts } from '../../lib/utils/capture_prompts';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): branch track`, function () {
    configureTest(this, scene);
    it('Can track and restack the current branch if previously untracked', () => {
      // Create our dangling branch
      scene.repo.createAndCheckoutBranch('a');
      scene.repo.createChangeAndCommit('a1', 'a1');
      scene.repo.createChangeAndCommit('a2', 'a2');
      scene.repo.createChangeAndCommit('a3', 'a3');

      // Move main forward
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('b', 'b');

      // we should be able to track the dangling branch 'a' while it's checked out
      scene.repo.checkoutBranch('a');
      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `main`]);
      }).to.not.throw();

      expectCommits(scene.repo, 'a3, a2, a1, 1');

      scene.repo.runCliCommand([`restack`, `-o`]);

      expectCommits(scene.repo, 'a3, a2, a1, b, 1');

      // Prove that we have meta now.
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.eq('main');
    });
    it('Can track a branch, and then insert a branch before and track both as a stack', () => {
      // Create our branch
      scene.repo.createAndCheckoutBranch('b');
      scene.repo.createChangeAndCommit('a', 'a');
      scene.repo.createChangeAndCommit('b', 'b');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `main`]);
      }).to.not.throw();

      expectCommits(scene.repo, 'b, a, 1');

      // Prove that we have meta now.
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.eq('main');

      scene.repo.runGitCommand([`branch`, `a`, `b~`]);
      scene.repo.checkoutBranch('a');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `main`]);
      }).to.not.throw();

      expectCommits(scene.repo, 'a, 1');

      // Prove that we have meta now.
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.eq('main');

      scene.repo.checkoutBranch('b');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `a`]);
      }).to.not.throw();

      expectCommits(scene.repo, 'b, a, 1');

      // Prove that meta is correctly updated.
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.eq('a');
    });
    it('Needs a rebase to track a branch that is created and whose parent is amended', () => {
      // Create our branch
      scene.repo.createAndCheckoutBranch('a');
      scene.repo.createChangeAndCommit('a', 'a');
      scene.repo.createAndCheckoutBranch('b');
      scene.repo.createChangeAndCommit('b', 'b');
      expectCommits(scene.repo, 'b, a, 1');

      scene.repo.checkoutBranch('a');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `main`]);
      }).not.to.throw();

      scene.repo.createChangeAndAmend('a1', 'a1');
      scene.repo.checkoutBranch('b');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `a`]);
      }).to.throw();

      scene.repo.runGitCommand(['rebase', 'a']);

      expect(() => {
        scene.repo.runCliCommand([`track`, `-p`, `a`]);
      }).to.not.throw();

      expectCommits(scene.repo, 'b, a, 1');

      // Prove that we have meta now.
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.eq('a');
    });

    it('Tracks the most recent ancestor when `--force` is passed in', () => {
      // Create our branch
      scene.repo.createAndCheckoutBranch('a');
      scene.repo.createChangeAndCommit('a', 'a');
      expectCommits(scene.repo, 'a, 1');

      scene.repo.checkoutBranch('a');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-f`]);
      }).not.to.throw();

      expect(() => {
        scene.repo.runCliCommand([`down`]);
      }).not.to.throw();
      expect(scene.repo.currentBranchName()).to.eq('main');

      scene.repo.runCliCommand([`up`]);
      scene.repo.createAndCheckoutBranch('b');
      scene.repo.createChangeAndCommit('b', 'b');
      expectCommits(scene.repo, 'b, a, 1');

      expect(() => {
        scene.repo.runCliCommand([`track`, `-f`]);
      }).not.to.throw();

      expect(() => {
        scene.repo.runCliCommand([`down`]);
      }).not.to.throw();
      expect(scene.repo.currentBranchName()).to.eq('a');
    });

    function untrackedChain(): void {
      scene.repo.createAndCheckoutBranch('a');
      scene.repo.createChangeAndCommit('a', 'a');
      scene.repo.createAndCheckoutBranch('b');
      scene.repo.createChangeAndCommit('b1', 'b1');
      scene.repo.createChangeAndCommit('b2', 'b2');
      scene.repo.createAndCheckoutBranch('c');
      scene.repo.createChangeAndCommit('c', 'c');
    }

    function expectParent(branch: string, parent: string): void {
      expect(
        scene.repo.runCliCommandAndGetOutput([`parent`, `--no-interactive`]),
        `parent of ${branch}`
      ).to.equal(parent);
    }

    it('Recursively tracks untracked parents by default', () => {
      untrackedChain();
      scene.repo.runCliCommand([`track`, `-f`]);
      expectParent('c', 'b');
      scene.repo.checkoutBranch('b');
      expectParent('b', 'a');
      scene.repo.checkoutBranch('a');
      expectParent('a', 'main');
    });

    it('Offers every ancestor as a parent, with commit counts', async () => {
      untrackedChain();
      const prompts = await capturePrompts(scene, ['b', 'main'], (context) =>
        trackBranch(
          { branchName: undefined, parentBranchName: undefined, force: false },
          context
        )
      );
      expect(prompts.map((p) => p.map((c) => c.title))).to.deep.equal([
        ['b (1 commit)', 'a (3 commits)', 'main (4 commits)'],
        ['a (2 commits)', 'main (3 commits)'],
      ]);
      expectParent('c', 'b');
      scene.repo.checkoutBranch('b');
      expectParent('b', 'main');
    });

    it('Stops recursing at a tracked parent', async () => {
      untrackedChain();
      scene.repo.checkoutBranch('a');
      scene.repo.runCliCommand([`track`, `-p`, `main`]);
      scene.repo.checkoutBranch('c');
      const prompts = await capturePrompts(scene, ['a'], (context) =>
        trackBranch(
          { branchName: undefined, parentBranchName: undefined, force: false },
          context
        )
      );
      expect(prompts).to.have.length(1);
      expectParent('c', 'a');
    });

    it('With --parent, tracks only the one branch', () => {
      untrackedChain();
      scene.repo.runCliCommand([`track`, `-p`, `main`]);
      expectParent('c', 'main');
      scene.repo.checkoutBranch('b');
      expect(() =>
        scene.repo.runCliCommand([`parent`, `--no-interactive`])
      ).to.throw();
    });

    it('Refuses to guess between several parents non-interactively', () => {
      untrackedChain();
      expect(() =>
        scene.repo.runCliCommand([`track`, `--no-interactive`])
      ).to.throw();
      expect(() =>
        scene.repo.runCliCommand([`parent`, `--no-interactive`])
      ).to.throw();
    });
  });
}
