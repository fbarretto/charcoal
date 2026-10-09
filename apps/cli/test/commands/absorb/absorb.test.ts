import { expect } from 'chai';
import { spawnSync } from 'child_process';
import path from 'path';
import prompts from 'prompts';
import { absorbAction } from '../../../src/actions/absorb';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

const hasGitAbsorb = !spawnSync('git-absorb', ['--version']).error;

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): absorb`, function () {
    configureTest(this, scene);

    beforeEach(function () {
      if (!hasGitAbsorb) {
        this.skip();
      }
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('a2', 'a');
      scene.repo.createChange('b2', 'b');
    });

    const show = (rev: string) =>
      scene.repo.runGitCommandAndGetOutput([`show`, rev]);
    const refs = () =>
      ['a', 'b', 'c'].map((b) => scene.repo.getRef(`refs/heads/${b}`));

    it('Absorbs each hunk into the branch that introduced it and restacks upstack', () => {
      scene.repo.createChange('new', 'new');
      scene.repo.createChange('wip', '1', true);

      scene.repo.runCliCommand([`absorb`, `-f`]);

      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(show('a:a_test.txt')).to.equal('a2');
      expect(
        scene.repo.runGitCommandAndGetOutput([`ls-tree`, `--name-only`, `a`])
      ).not.to.contain('b_test.txt');
      expect(show('b:b_test.txt')).to.equal('b2');
      expect(show('c:a_test.txt')).to.equal('a2');
      expect(show('c:b_test.txt')).to.equal('b2');
      expectCommits(scene.repo, 'b, a, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'needs restack'
      );
      // The new file can't be absorbed, so it stays uncommitted with the WIP.
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--name-only`])
      ).to.equal('1_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `ls-files`,
          `--others`,
          `--exclude-standard`,
        ])
      ).to.equal('new_test.txt');
    });

    it('Reapplies leftover changes after continuing a restack conflict', () => {
      // c also edits b_test.txt, so restacking it onto the absorbed b conflicts.
      scene.repo.runGitCommand([`stash`]);
      scene.repo.checkoutBranch('c');
      scene.repo.createChangeAndAmend('cb', 'b');
      scene.repo.checkoutBranch('b');
      scene.repo.runGitCommand([`stash`, `pop`, `--index`]);
      scene.repo.createChange('new', 'new');
      scene.repo.createChange('wip', '1', true);

      expect(() => scene.repo.runCliCommand([`absorb`, `-f`])).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
      scene.repo.runCliCommand([`continue`]);

      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(show('a:a_test.txt')).to.equal('a2');
      expect(show('b:b_test.txt')).to.equal('b2');
      expect(show('c:a_test.txt')).to.equal('a2');
      expect(
        scene.repo.runGitCommandAndGetOutput([`diff`, `--name-only`])
      ).to.equal('1_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `ls-files`,
          `--others`,
          `--exclude-standard`,
        ])
      ).to.equal('new_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `for-each-ref`,
          `refs/charcoal/stash/`,
        ])
      ).to.equal('');
    });

    it('Prints how many hunks were not absorbed', () => {
      scene.repo.createChange('new', 'new');
      expect(scene.repo.runCliCommandAndGetOutput([`absorb`, `-f`])).to.contain(
        '1 hunk was not absorbed'
      );
      expect(show('a:a_test.txt')).to.equal('a2');
    });

    it('Leaves untracked files out with -a', () => {
      scene.repo.runGitCommand([`reset`, `-q`]);
      scene.repo.createChange('new', 'new', true);

      scene.repo.runCliCommand([`absorb`, `-a`, `-f`]);

      expect(show('a:a_test.txt')).to.equal('a2');
      expect(show('b:b_test.txt')).to.equal('b2');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `ls-files`,
          `--others`,
          `--exclude-standard`,
        ])
      ).to.equal('new_test.txt');
    });

    it('Asks whether to stage unstaged changes, offering tracked files only', async () => {
      scene.repo.runGitCommand([`reset`, `-q`]);
      scene.repo.createChange('new', 'new', true);
      prompts.inject(['update']);
      await absorbAction(
        { all: false, dryRun: false, force: true, patch: false },
        scene.getContext(true)
      );
      expect(show('a:a_test.txt')).to.equal('a2');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `ls-files`,
          `--others`,
          `--exclude-standard`,
        ])
      ).to.equal('new_test.txt');
    });

    it('Changes nothing with --dry-run', () => {
      const before = refs();
      scene.repo.runCliCommand([`absorb`, `--dry-run`]);
      expect(refs()).to.deep.equal(before);
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('a_test.txt\nb_test.txt');
    });

    it('Refuses when a downstack branch is frozen', () => {
      scene.repo.runCliCommand([`freeze`, `a`]);
      const before = refs();
      expect(() => scene.repo.runCliCommand([`absorb`, `-f`])).to.throw();
      expect(refs()).to.deep.equal(before);
    });

    it('Stays on the current branch when it has no upstack to restack', () => {
      // Move the pending changes from b to the top of the stack, c.
      scene.repo.runGitCommand([`stash`]);
      scene.repo.checkoutBranch('c');
      scene.repo.runGitCommand([`stash`, `pop`]);

      scene.repo.runCliCommand([`absorb`, `-f`, `-a`]);
      expect(scene.repo.currentBranchName()).to.equal('c');
      expect(show('a:a_test.txt')).to.equal('a2');
    });

    it('Stays on the current branch when nothing can be absorbed', () => {
      scene.repo.runGitCommand([`reset`, `--hard`]);
      scene.repo.createChange('new', 'new');
      scene.repo.runCliCommand([`absorb`, `-f`]);
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('Can be undone', () => {
      const before = refs();
      scene.repo.runCliCommand([`absorb`, `-f`]);
      expect(refs()).to.not.deep.equal(before);
      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(refs()).to.deep.equal(before);
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('Fails with an install hint when git-absorb is missing', () => {
      const originalPath = process.env.PATH;
      process.env.PATH = [
        path.dirname(process.execPath),
        '/usr/bin',
        '/bin',
      ].join(path.delimiter);
      try {
        expect(() => scene.repo.runCliCommand([`absorb`, `-f`])).to.throw(
          /brew install git-absorb/
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
}
