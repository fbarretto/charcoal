import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';
import { expectBranches } from '../lib/utils/expect_branches';
import { fakeGitSquashAndMerge } from '../lib/utils/fake_squash_and_merge';

for (const scene of [new BasicScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): multiple worktrees`, function () {
    configureTest(this, scene);

    let worktree: string;
    beforeEach(() => {
      worktree = fs.realpathSync(path.join(tmp.dirSync().name)) + '/wt';
    });
    afterEach(() => {
      scene.repo.runGitCommand(['worktree', 'remove', '--force', worktree]);
    });

    const buildStackWithBInWorktree = () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'b']);
    };

    it('Restack skips a branch checked out in another worktree', () => {
      buildStackWithBInWorktree();
      const bBefore = scene.repo.getRef('refs/heads/b');
      scene.repo.createChangeAndAmend('a2', 'a');

      const output = scene.repo.runCliCommandAndGetOutput([`restack`]);
      expect(output).to.contain(
        `Skipped b: it is checked out in another worktree (${worktree})`
      );
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bBefore);
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it('Sync does not delete a merged branch checked out in another worktree', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      fakeGitSquashAndMerge(scene.repo, 'a', 'squash');
      scene.repo.checkoutBranch('main');
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'a']);

      const output = scene.repo.runCliCommandAndGetOutput([
        `sync`,
        `-f`,
        `--no-pull`,
      ]);
      expect(output).to.contain(
        `Skipped a: it is checked out in another worktree (${worktree})`
      );
      expectBranches(scene.repo, 'a, main');
    });

    it('Keeps undo history per worktree', () => {
      scene.repo.createAndCheckoutBranch('other');
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'main']);
      fs.writeFileSync(path.join(worktree, 'wt_file.txt'), 'wt');
      scene.repo.runCliCommand(['--cwd', worktree, 'create', 'w', '-am', 'w']);

      expect(scene.repo.runCliCommandAndGetOutput([`undo`, `-f`])).to.contain(
        'Nothing to undo'
      );
      expectBranches(scene.repo, 'main, other, w');
      scene.repo.runCliCommand(['--cwd', worktree, 'undo', '-f']);
      expectBranches(scene.repo, 'main, other');
    });

    it('Refuses to undo when it would touch a branch checked out elsewhere', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'a']);

      const output = scene.repo.runCliCommandAndGetOutput([`undo`, `-f`]);
      expect(output).to.contain('checked out in another worktree');
      expect(output).to.contain(worktree);
      expectBranches(scene.repo, 'a, main');
    });
  });
}
