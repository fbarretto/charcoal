import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): abort`, function () {
    configureTest(this, scene);

    it('Errors when no Charcoal command is halted', () => {
      expect(() => scene.repo.runCliCommand(['abort', '-f'])).to.throw();
    });

    it('Errors during a git initiated rebase', () => {
      scene.repo.createAndCheckoutBranch('a');
      scene.repo.createChangeAndCommit('a1');
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('main1');
      scene.repo.checkoutBranch('a');
      scene.repo.runGitCommand(['rebase', 'main']);
      expect(scene.repo.rebaseInProgress()).to.be.true;

      expect(() => scene.repo.runCliCommand(['abort', '-f'])).to.throw();
    });

    it('Fails with a --force hint when it cannot prompt for confirmation', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('1');
      expect(() => scene.repo.runCliCommand(['restack', '-q'])).to.throw();

      expect(() => scene.repo.runCliCommand(['abort'])).to.throw('--force');
      expect(scene.repo.rebaseInProgress()).to.be.true;
    });

    it('Aborts a restack halted by a merge conflict', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      const bSha = scene.repo.getRef('refs/heads/b');

      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('1');

      expect(() => scene.repo.runCliCommand(['restack', '-q'])).to.throw();
      expect(scene.repo.rebaseInProgress()).to.be.true;

      scene.repo.runCliCommand(['abort', '-f']);

      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bSha);
      expect(() => scene.repo.runCliCommand(['continue'])).to.throw();

      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Restores every branch the halted command had already moved, and undo then targets the previous command', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'a');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      const [bBefore, cBefore] = [
        scene.repo.getRef('refs/heads/b'),
        scene.repo.getRef('refs/heads/c'),
      ];

      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('a2', 'a');
      // b restacks cleanly, then c conflicts on a_test.txt.
      expect(() => scene.repo.runCliCommand(['restack'])).to.throw();
      expect(scene.repo.getRef('refs/heads/b')).not.to.equal(bBefore);

      const output = scene.repo.runCliCommandAndGetOutput(['abort', '-f']);
      expect(output).to.contain('Aborted ch restack');
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bBefore);
      expect(scene.repo.getRef('refs/heads/c')).to.equal(cBefore);
      expect(scene.repo.currentBranchName()).to.equal('a');

      expect(scene.repo.runCliCommandAndGetOutput(['undo', '-f'])).to.contain(
        'Undoing ch create'
      );
      expect(
        scene.repo.runGitCommandAndGetOutput(['for-each-ref', 'refs/heads/c'])
      ).to.equal('');
    });

    it('Refuses other mutating commands while halted, so abort still restores the state from before the halted command', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'a');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      const [bBefore, cBefore] = [
        scene.repo.getRef('refs/heads/b'),
        scene.repo.getRef('refs/heads/c'),
      ];

      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndAmend('a2', 'a');
      expect(() => scene.repo.runCliCommand(['restack'])).to.throw();
      const continuation = fs.readFileSync(
        path.join(scene.repo.dir, '.git', '.gtcontinue'),
        'utf-8'
      );

      for (const command of [
        ['create', 'x', '-m', 'x'],
        ['modify', '-a', '-m', 'm'],
        ['restack'],
        ['checkout', 'b'],
        ['up'],
        ['undo', '-f'],
        ['submit'],
      ]) {
        expect(() => scene.repo.runCliCommand(command)).to.throw(
          'blocked while a rebase is in progress'
        );
      }
      expect(
        fs.readFileSync(path.join(scene.repo.dir, '.git', '.gtcontinue'), 'utf-8')
      ).to.equal(continuation);
      expect(scene.repo.runCliCommandAndGetOutput(['ls'])).to.contain('b');
      scene.repo.runCliCommand(['info']);

      scene.repo.runCliCommand(['abort', '-f']);
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(scene.repo.getRef('refs/heads/b')).to.equal(bBefore);
      expect(scene.repo.getRef('refs/heads/c')).to.equal(cBefore);
      expect(
        scene.repo.runGitCommandAndGetOutput(['for-each-ref', 'refs/heads/x'])
      ).to.equal('');
    });
  });
}
