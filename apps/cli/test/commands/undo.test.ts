import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { allScenes } from '../lib/scenes/all_scenes';
import { configureTest } from '../lib/utils/configure_test';
import { expectBranches } from '../lib/utils/expect_branches';
import { expectCommits } from '../lib/utils/expect_commits';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
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

    it('Gives back the changes create committed, staged', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('A  a_test.txt');
    });

    it('Gives back the changes create --onto carried to the other branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `--onto`, `a`]);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('A  c_test.txt');
    });

    it('Gives back the changes modify committed, staged', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a');
      scene.repo.createChange('new', 'new');
      scene.repo.runCliCommand([`modify`]);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('M  a_test.txt\nA  new_test.txt');
      expect(
        fs.readFileSync(path.join(scene.repo.dir, 'a_test.txt'), 'utf-8')
      ).to.equal('a2');
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

    it('Brings back every branch deleted by delete --upstack', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      const bSha = scene.repo.getRef('refs/heads/b');

      scene.repo.runCliCommand([`delete`, `a`, `--upstack`, `-f`]);
      expectBranches(scene.repo, 'main');

      scene.repo.runCliCommand([`undo`, `-f`]);
      expectBranches(scene.repo, 'a, b, main');
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bSha);
      expect(scene.repo.currentBranchName()).to.equal('b');
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
      // The undone create gives b's changes back; undo needs a clean tree.
      scene.repo.runGitCommand([`reset`, `--hard`]);

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

    it('Keeps commits made after the undone command on branches it did not change', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndCommit('later', 'later');
      const aAfter = scene.repo.getRef('refs/heads/a');

      scene.repo.runCliCommand([`undo`, `-f`]);

      expectBranches(scene.repo, 'a, main');
      expect(scene.repo.getRef('refs/heads/a')).to.equal(aAfter);
    });

    it('Refuses when a branch the command changed has moved since', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a2`]);
      scene.repo.createChangeAndCommit('later', 'later');
      const aAfter = scene.repo.getRef('refs/heads/a');

      expect(() => scene.repo.runCliCommand([`undo`, `-f`])).to.throw(
        'has moved since'
      );
      expect(scene.repo.getRef('refs/heads/a')).to.equal(aAfter);
    });

    it('Undoes a whole restack that was finished with continue', () => {
      scene.repo.createChange('2');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `2`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      const before = ['a', 'b'].map((b) =>
        scene.repo.getRef(`refs/heads/${b}`)
      );
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('1.5');
      scene.repo.checkoutBranch('b');

      expect(() => scene.repo.runCliCommand([`restack`, `-q`])).to.throw();
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand([`continue`, `-q`]);

      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(
        ['a', 'b'].map((b) => scene.repo.getRef(`refs/heads/${b}`))
      ).to.deep.equal(before);
    });
  });
}
