import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): test`, function () {
    configureTest(this, scene);

    it('Runs the command on each branch when stdout is not a TTY', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');

      const output = scene.repo.runCliCommandAndGetOutput([
        'test',
        'test -f b_test.txt',
      ]);
      expect(output).not.to.contain('is not a function');
      expect(output).to.contain('[failed]: a');
      expect(output).to.contain('[success]: b');
      expect(output).not.to.contain('[pending]');
      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(() =>
        scene.repo.runCliCommand(['test', 'test -f b_test.txt'])
      ).to.throw();
      scene.repo.runCliCommand(['test', 'test -f a_test.txt']);
    });

    it('Limits the run to the current branch and its descendants with --upstack', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      const output = scene.repo.runCliCommandAndGetOutput([
        'test',
        'echo ok',
        '--upstack',
      ]);
      expect(output).to.contain('[success]: b');
      expect(output).not.to.contain(': a');
    });

    const setUpStack = () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
    };

    it('Refuses to start with uncommitted changes to tracked files', () => {
      setUpStack();
      scene.repo.createChange('dirty', 'a', true);

      expect(() => scene.repo.runCliCommand(['test', 'true'])).to.throw(
        'tracked changes that have not been committed'
      );
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it("Discards a branch's tracked edits before testing the next one", () => {
      setUpStack();

      scene.repo.runCliCommand([
        'test',
        '! grep -q junk a_test.txt && echo junk >> a_test.txt',
      ]);

      expect(
        scene.repo.runGitCommandAndGetOutput([`status`, `--porcelain`])
      ).to.equal('');
    });
  });
}
