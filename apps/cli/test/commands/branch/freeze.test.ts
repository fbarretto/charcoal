import { expect } from 'chai';
import { readMetadataRef } from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): freeze`, function () {
    configureTest(this, scene);

    const frozen = (branch: string) =>
      readMetadataRef(branch, scene.dir).frozen === true;

    beforeEach(() => {
      for (const b of ['a', 'b', 'c']) {
        scene.repo.createChange(b, b);
        scene.repo.runCliCommand([`create`, b, `-m`, b]);
      }
    });

    it('Freezes a branch and its downstack, unfreezes a branch and its upstack', () => {
      scene.repo.runCliCommand([`freeze`, `b`]);
      expect(['a', 'b', 'c'].map(frozen)).to.deep.equal([true, true, false]);

      scene.repo.runCliCommand([`freeze`]);
      expect(['a', 'b', 'c'].map(frozen)).to.deep.equal([true, true, true]);

      scene.repo.runCliCommand([`unfreeze`, `b`]);
      expect(['a', 'b', 'c'].map(frozen)).to.deep.equal([true, false, false]);
      expect(readMetadataRef('b', scene.dir).parentBranchName).to.equal('a');
    });

    it('Refuses to freeze trunk', () => {
      expect(() => scene.repo.runCliCommand([`freeze`, `main`])).to.throw();
    });

    it('Marks frozen branches in log output', () => {
      scene.repo.runCliCommand([`freeze`, `a`]);
      const output = scene.repo.runCliCommandAndGetOutput([`ls`]);
      expect(output).to.contain('a (frozen)');
      expect(output).not.to.contain('b (frozen)');
    });

    it('Refuses to rewrite, move, rename, or delete a frozen branch', () => {
      scene.repo.runCliCommand([`freeze`, `b`]);
      const refs = () =>
        ['a', 'b', 'c'].map((b) => scene.repo.getRef(`refs/heads/${b}`));
      const before = refs();

      scene.repo.checkoutBranch('b');
      for (const cmd of [
        [`modify`, `-m`, `x`],
        [`squash`, `-n`],
        [`rename`, `b2`],
        [`fold`],
        [`move`, `--onto`, `main`],
        [`delete`, `b`, `-f`],
        [`split`, `--by-file`, `b_test.txt`],
      ]) {
        expect(() => scene.repo.runCliCommand(cmd), cmd.join(' ')).to.throw(
          /b.*is frozen.*ch unfreeze b/
        );
      }

      scene.repo.checkoutBranch('c');
      scene.repo.createChange('into', 'into');
      scene.repo.runGitCommand([`add`, `.`]);
      expect(() =>
        scene.repo.runCliCommand([`modify`, `--into`, `b`, `-m`, `x`])
      ).to.throw(/ch unfreeze b/);
      // c's parent is frozen, so folding c into b is refused too.
      expect(() => scene.repo.runCliCommand([`fold`])).to.throw(
        /ch unfreeze b/
      );

      scene.repo.runCliCommand([`freeze`]);
      expect(() => scene.repo.runCliCommand([`pop`])).to.throw(/ch unfreeze c/);

      expect(refs()).to.deep.equal(before);
      expectBranches(scene.repo, 'a, b, c, main');
      expect(scene.repo.currentBranchName()).to.equal('c');
    });

    it('Refuses `modify -a`/`-u` on a frozen branch before staging anything', () => {
      scene.repo.runCliCommand([`freeze`, `b`]);
      scene.repo.checkoutBranch('b');
      scene.repo.createChange('change', 'b', true);
      for (const cmd of [
        [`modify`, `-a`],
        [`modify`, `-u`],
        [`modify`, `-c`, `-a`, `-m`, `x`],
      ]) {
        expect(() => scene.repo.runCliCommand(cmd), cmd.join(' ')).to.throw(
          /ch unfreeze b/
        );
        expect(
          scene.repo.runGitCommandAndGetOutput([
            `diff`,
            `--cached`,
            `--name-only`,
          ]),
          cmd.join(' ')
        ).to.equal('');
      }
    });

    it('Restack skips frozen branches and restacks the ones above them', () => {
      scene.repo.runCliCommand([`freeze`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('m', 'm');
      // A teammate's update to a, pulled outside of Charcoal.
      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndCommit('a2', 'a2');
      const aTip = scene.repo.getRef('refs/heads/a');

      scene.repo.checkoutBranch('c');
      const output = scene.repo.runCliCommandAndGetOutput([`restack`]);
      expect(output).to.contain('Skipped frozen branch');

      expect(scene.repo.getRef('refs/heads/a')).to.equal(aTip);
      expect(
        scene.repo.runGitCommandAndGetOutput([`merge-base`, `a`, `b`])
      ).to.equal(aTip);
      expect(
        scene.repo.runGitCommandAndGetOutput([`merge-base`, `b`, `c`])
      ).to.equal(scene.repo.getRef('refs/heads/b'));
    });

    it('Allows stacking a new branch on a frozen branch', () => {
      scene.repo.runCliCommand([`freeze`]);
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      expect(frozen('d')).to.equal(false);
      scene.repo.createChange('d2', 'd');
      scene.repo.runCliCommand([`modify`, `-m`, `d2`]);
    });

    it('Can undo a freeze', () => {
      scene.repo.runCliCommand([`freeze`]);
      scene.repo.runCliCommand([`undo`, `-f`]);
      expect(['a', 'b', 'c'].map(frozen)).to.deep.equal([false, false, false]);
    });
  });
}
