import { expect } from 'chai';
import { spawnSync } from 'child_process';
import path from 'path';
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
