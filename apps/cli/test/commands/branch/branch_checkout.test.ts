import { expect } from 'chai';
import { checkoutBranch } from '../../../src/actions/checkout_branch';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { capturePrompts, choiceValues } from '../../lib/utils/capture_prompts';

for (const scene of allScenes) {
  describe(`(${scene}): branch checkout`, function () {
    configureTest(this, scene);

    it('Can checkout a branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.runCliCommand([`checkout`, `a`]);

      expect(scene.repo.currentBranchName()).to.eq('a');
    });

    it('Checks out trunk with --trunk', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.runCliCommand([`checkout`, `-t`]);

      expect(scene.repo.currentBranchName()).to.eq('main');
    });

    it('Limits the selector to the current stack with --stack', async () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');

      const [all] = await capturePrompts(scene, ['a'], (context) =>
        checkoutBranch({ branchName: undefined }, context)
      );
      expect(choiceValues(all)).to.deep.equal(['a', 'b', 'c', 'main']);

      const [stack] = await capturePrompts(scene, ['b'], (context) =>
        checkoutBranch(
          { branchName: undefined, onlyCurrentStack: true },
          context
        )
      );
      expect(choiceValues(stack)).to.deep.equal(['a', 'b', 'main']);
      expect(scene.repo.currentBranchName()).to.eq('b');
    });
  });
}
