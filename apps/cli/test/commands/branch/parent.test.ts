import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): parent`, function () {
    configureTest(this, scene);

    it('Prints the parent of the current branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('a');
      scene.repo.checkoutBranch('a');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal(
        'main'
      );
    });

    it('Errors on trunk', () => {
      expect(() => scene.repo.runCliCommand([`parent`])).to.throw();
    });

    it('Errors on an untracked branch', () => {
      scene.repo.createAndCheckoutBranch('a');
      expect(() => scene.repo.runCliCommand([`parent`])).to.throw();
    });
  });
}
