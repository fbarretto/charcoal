import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): modify --into`, function () {
    configureTest(this, scene);

    function setUpStack(): void {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');
    }

    function show(rev: string): string {
      return scene.repo.runGitCommandAndGetOutput([`show`, rev]);
    }

    it('Amends staged changes into a downstack branch, keeping unstaged ones', () => {
      setUpStack();
      scene.repo.createChange('a2', 'a');
      scene.repo.createChange('b-wip', 'b', true);

      scene.repo.runCliCommand([`modify`, `--into`, `a`]);

      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(show('a:a_test.txt')).to.equal('a2');
      expect(show('b:a_test.txt')).to.equal('a2');
      expect(show('c:a_test.txt')).to.equal('a2');
      expectCommits(scene.repo, 'b, a, 1');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--cached`, `--stat`])
      ).to.equal('');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--name-only`])
      ).to.equal('b_test.txt');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'needs restack'
      );
    });

    it('Creates a new commit with --commit', () => {
      setUpStack();
      scene.repo.createChange('a2', 'a');

      scene.repo.runCliCommand([`modify`, `--into`, `a`, `-c`, `-m`, `fix`]);

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, fix, a, 1');
      expect(show('c:a_test.txt')).to.equal('a2');
    });

    it('Fails cleanly when the staged changes do not apply', () => {
      setUpStack();
      const aBefore = scene.repo.getRef('refs/heads/a');
      scene.repo.createChange('b2', 'b');

      expect(() =>
        scene.repo.runCliCommand([`modify`, `--into`, `a`])
      ).to.throw();

      expect(scene.repo.getRef('refs/heads/a')).to.equal(aBefore);
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('b_test.txt');
    });

    it('Can be undone', () => {
      setUpStack();
      const before = ['a', 'b', 'c'].map((b) =>
        scene.repo.getRef(`refs/heads/${b}`)
      );
      scene.repo.createChange('a2', 'a');

      scene.repo.runCliCommand([`modify`, `--into`, `a`]);
      scene.repo.runCliCommand([`undo`, `-f`]);

      expect(
        ['a', 'b', 'c'].map((b) => scene.repo.getRef(`refs/heads/${b}`))
      ).to.deep.equal(before);
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('Refuses a target that is not downstack', () => {
      setUpStack();
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('a2', 'a');
      expect(() =>
        scene.repo.runCliCommand([`modify`, `--into`, `b`])
      ).to.throw();
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.createChange('d2', 'd');
      expect(() =>
        scene.repo.runCliCommand([`modify`, `--into`, `b`])
      ).to.throw();
      expect(show('b:b_test.txt')).to.equal('b');
    });

    it('Refuses a target checked out in another worktree', () => {
      setUpStack();
      scene.repo.checkoutBranch('c');
      scene.repo.runGitCommand([`worktree`, `add`, `${scene.dir}-wt`, `a`]);
      try {
        scene.repo.createChange('a2', 'a');
        expect(() =>
          scene.repo.runCliCommand([`modify`, `--into`, `a`])
        ).to.throw(/another worktree/);
        expect(show('a:a_test.txt')).to.equal('a');
      } finally {
        scene.repo.runGitCommand([
          `worktree`,
          `remove`,
          `--force`,
          `${scene.dir}-wt`,
        ]);
      }
    });

    // c adds x_test.txt, which the staged change adds to a, so restacking c
    // conflicts while b_test.txt carries an unstaged edit.
    function conflictOnRestack(): void {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'x');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('a2', 'x');
      scene.repo.createChange('b-wip', 'b', true);

      expect(() =>
        scene.repo.runCliCommand([`modify`, `--into`, `a`])
      ).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;
      expect(stashRefs()).not.to.equal('');
    }

    function stashRefs(): string {
      return scene.repo.runGitCommandAndGetOutput([
        `for-each-ref`,
        `refs/charcoal/stash/`,
      ]);
    }

    function expectUnstagedRestored(): void {
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--name-only`])
      ).to.equal('b_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--cached`, `--stat`])
      ).to.equal('');
      expect(stashRefs()).to.equal('');
    }

    it('Reapplies unstaged changes after continuing a restack conflict', () => {
      conflictOnRestack();
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand([`continue`]);

      expectUnstagedRestored();
      expect(show('b:x_test.txt')).to.equal('a2');
    });

    it('Reapplies unstaged changes after aborting a restack conflict', () => {
      conflictOnRestack();
      scene.repo.runCliCommand([`abort`, `-f`]);

      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--name-only`])
      ).to.equal('b_test.txt');
      // What --into committed to the target comes back staged.
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('x_test.txt');
      expect(stashRefs()).to.equal('');
    });
  });
}
