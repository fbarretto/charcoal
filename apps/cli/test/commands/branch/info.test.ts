import { expect } from 'chai';
import stripAnsi from 'strip-ansi';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  describe(`(${scene}): info`, function () {
    configureTest(this, scene);
    const info = (args: string[]) =>
      stripAnsi(scene.repo.runCliCommandAndGetOutput([`info`, ...args]));

    beforeEach(() => {
      scene.repo.createChange('a-contents', 'afile');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a-commit`]);
      scene.repo.createChange('b-contents', 'bfile');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b-commit`]);
    });

    it('Shows the current branch with its parent and children', () => {
      scene.repo.checkoutBranch('a');
      const out = info([]);
      expect(out).to.contain('a-commit');
      expect(out).to.contain('Parent: main');
      expect(out).to.contain('▸ b');
    });

    it('Shows a branch passed as an argument', () => {
      scene.repo.checkoutBranch('main');
      const out = info([`b`]);
      expect(out).to.contain('b-commit');
      expect(out).to.contain('Parent: a');
      expect(out).not.to.contain('a-commit');
    });

    it('--stat shows a diffstat instead of the diff', () => {
      const diff = info([`-d`]);
      expect(diff).to.contain('+b-contents');

      const stat = info([`-s`]);
      expect(stat).to.match(/bfile_test\.txt \| 1 \+/);
      expect(stat).not.to.contain('+b-contents');

      const patchStat = info([`-p`, `-s`]);
      expect(patchStat).to.match(/bfile_test\.txt \| 1 \+/);
      expect(patchStat).not.to.contain('+b-contents');
    });
  });
}
