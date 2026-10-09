import { expect } from 'chai';
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
  });
}
