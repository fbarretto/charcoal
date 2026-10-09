import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): trunk`, function () {
    configureTest(this, scene);

    it('Prints the trunk branch name', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(scene.repo.runCliCommandAndGetOutput([`trunk`])).to.equal('main');
    });

    it('Prints the single trunk with --all', () => {
      expect(scene.repo.runCliCommandAndGetOutput([`trunk`, `-a`])).to.equal(
        'main'
      );
    });
  });
}
