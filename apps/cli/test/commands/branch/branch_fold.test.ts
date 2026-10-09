import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): fold`, function () {
    configureTest(this, scene);

    it("Can't fold from trunk or into trunk", () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      expect(() => scene.repo.runCliCommand([`fold`])).to.throw();
      expect(() => scene.repo.runCliCommand([`fold`, `--keep`])).to.throw();

      scene.repo.runCliCommand([`down`]);

      expect(() => scene.repo.runCliCommand([`fold`])).to.throw();
      expect(() => scene.repo.runCliCommand([`fold`, `--keep`])).to.throw();
    });

    it('Can fold without --keep and restack children accordingly', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.runCliCommand([`down`, `2`]);
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');

      scene.repo.runCliCommand([`fold`]);
      expectBranches(scene.repo, 'a, c, d, main');
      expectCommits(scene.repo, 'b, a, 1');

      scene.repo.runCliCommand([`down`]);
      expectCommits(scene.repo, '1');

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a, 1');

      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, b, a, 1');
    });

    it('Can fold with --keep and restack children accordingly', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.runCliCommand([`down`, `2`]);
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');

      scene.repo.runCliCommand([`fold`, `--keep`]);
      expectBranches(scene.repo, 'b, c, d, main');
      expectCommits(scene.repo, 'b, a, 1');

      scene.repo.runCliCommand([`down`]);
      expectCommits(scene.repo, '1');

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a, 1');

      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, b, a, 1');
    });

    // Siblings c and d of b are restacked onto the folded branch. Both add a
    // file b also adds, so both conflict: whichever goes second is queued
    // behind the first conflict and restacked by `continue`.
    function buildConflictingSiblings(): void {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('c', 'b');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('d', 'b');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');
    }

    function resolve(): void {
      expect(scene.repo.rebaseInProgress()).to.be.true;
      scene.repo.resolveMergeConflicts();
      scene.repo.markMergeConflictsAsResolved();
    }

    function resolveBothConflicts(): void {
      resolve();
      expect(() => scene.repo.runCliCommand([`continue`])).to.throw();
      resolve();
      scene.repo.runCliCommand([`continue`]);
      expect(scene.repo.rebaseInProgress()).to.be.false;
    }

    function expectParent(branch: string, parent: string): void {
      scene.repo.checkoutBranch(branch);
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal(parent);
    }

    it('Restacks siblings queued behind a conflict after continue', () => {
      buildConflictingSiblings();

      expect(() => scene.repo.runCliCommand([`fold`])).to.throw();
      resolveBothConflicts();

      expectBranches(scene.repo, 'a, c, d, main');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, b, a, 1');
      expectParent('c', 'a');
      expectParent('d', 'a');
    });

    it('Re-parents siblings queued behind a conflict after continue with --keep', () => {
      buildConflictingSiblings();

      expect(() => scene.repo.runCliCommand([`fold`, `--keep`])).to.throw();
      resolveBothConflicts();

      expectBranches(scene.repo, 'b, c, d, main');
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a, 1');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, b, a, 1');
      expectParent('c', 'b');
      expectParent('d', 'b');
    });

    function buildStackWithOffshoot(): void {
      ['a', 'b', 'c'].forEach((b) => {
        scene.repo.createChange(b, b);
        scene.repo.runCliCommand([`create`, b, `-m`, b]);
      });
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      scene.repo.checkoutBranch('b');
    }

    it('Folds the whole stack into the bottom branch with --stack', () => {
      buildStackWithOffshoot();
      scene.repo.runCliCommand([`fold`, `--stack`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      expectBranches(scene.repo, 'a, d, main');
      expectCommits(scene.repo, 'c, b, a, 1');
      expectParent('d', 'a');
      scene.repo.checkoutBranch('d');
      expectCommits(scene.repo, 'd, c, b, a, 1');
    });

    it('Folds the whole stack into the current branch with --stack --keep', () => {
      buildStackWithOffshoot();
      scene.repo.runCliCommand([`fold`, `--stack`, `--keep`]);
      expect(scene.repo.currentBranchName()).to.equal('b');
      expectBranches(scene.repo, 'b, d, main');
      expectCommits(scene.repo, 'c, b, a, 1');
      expectParent('b', 'main');
      expectParent('d', 'b');
    });

    it('Refuses --stack at a fork without a prompt', () => {
      buildStackWithOffshoot();
      scene.repo.checkoutBranch('a');
      expect(() => scene.repo.runCliCommand([`fold`, `--stack`])).to.throw();
      expectBranches(scene.repo, 'a, b, c, d, main');
    });

    it('Closes the folded-away PR with f -c', () => {
      const binDir = tmp.dirSync().name;
      const ghLog = path.join(binDir, 'gh.log');
      fs.writeFileSync(
        path.join(binDir, 'gh'),
        `#!/bin/sh\necho "$@" >> "${ghLog}"\n`,
        { mode: 0o755 }
      );
      const originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
      try {
        scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
        scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
        ['a', 'b'].forEach((b, i) => {
          scene.repo.createChange(b, b);
          scene.repo.runCliCommand([`create`, b, `-m`, b]);
          writeMetadataRef(
            b,
            {
              ...readMetadataRef(b, scene.dir),
              prInfo: { number: i + 1, state: 'OPEN' },
            },
            scene.dir
          );
        });
        scene.repo.runCliCommand([`f`, `-c`]);
        expectBranches(scene.repo, 'a, main');
        expect(fs.readFileSync(ghLog, 'utf-8').trim()).to.equal(
          'pr close 2 --repo owner/name'
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
}
