import { expect } from 'chai';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): unlink`, function () {
    configureTest(this, scene);

    beforeEach(() => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      for (const [branch, number] of [
        ['a', 1],
        ['b', 2],
      ] as const) {
        writeMetadataRef(
          branch,
          {
            ...readMetadataRef(branch, scene.dir),
            prInfo: { number, state: 'OPEN' },
          },
          scene.dir
        );
      }
    });

    it('Clears the PR info of the current branch', () => {
      scene.repo.runCliCommand([`unlink`]);
      expect(readMetadataRef('b', scene.dir).prInfo).to.deep.equal({});
      expect(readMetadataRef('b', scene.dir).parentBranchName).to.equal('a');
      expect(readMetadataRef('a', scene.dir).prInfo?.number).to.equal(1);
    });

    it('Clears the PR info of a named branch', () => {
      scene.repo.runCliCommand([`unlink`, `a`]);
      expect(readMetadataRef('a', scene.dir).prInfo).to.deep.equal({});
      expect(readMetadataRef('b', scene.dir).prInfo?.number).to.equal(2);
    });

    it('Errors on trunk, untracked, or unknown branches', () => {
      expect(() => scene.repo.runCliCommand([`unlink`, `main`])).to.throw();
      expect(() => scene.repo.runCliCommand([`unlink`, `nope`])).to.throw();
      scene.repo.createAndCheckoutBranch('c');
      expect(() => scene.repo.runCliCommand([`unlink`])).to.throw();
    });
  });
}
