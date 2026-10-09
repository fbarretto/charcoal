import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): children`, function () {
    configureTest(this, scene);

    it('Prints the children of the current branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);

      scene.repo.checkoutBranch('a');
      expect(
        scene.repo.runCliCommandAndGetOutput([`children`]).split('\n').sort()
      ).to.deep.equal(['b', 'c']);

      scene.repo.checkoutBranch('main');
      expect(scene.repo.runCliCommandAndGetOutput([`children`])).to.equal('a');

      scene.repo.checkoutBranch('b');
      expect(scene.repo.runCliCommandAndGetOutput([`children`])).to.equal('');
    });
  });
}
