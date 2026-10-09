import { expect } from 'chai';
import fs from 'fs-extra';
import { withEditor } from '../../lib/utils/interactive';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): squash`, function () {
    configureTest(this, scene);

    it('Can squash two commits into one and restack a child', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a2`]);

      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      expectCommits(scene.repo, 'b, a2, a, 1');

      scene.repo.runCliCommand([`down`]);
      scene.repo.runCliCommand([`squash`, `-n`]);
      scene.repo.runCliCommand([`up`]);

      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Does nothing on a branch with a single commit', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const before = scene.repo.getRef('refs/heads/a');
      const template = `${scene.dir}/../template-${Date.now()}`;
      withEditor(
        'edited',
        () => scene.repo.runCliCommand([`squash`]),
        template
      );
      expect(scene.repo.getRef('refs/heads/a')).to.equal(before);
      expect(fs.existsSync(template)).to.be.false;
    });

    it('Joins repeated -m as paragraphs', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a2');
      scene.repo.runCliCommand([`modify`, `-c`, `-m`, `a2`]);
      scene.repo.runCliCommand([`squash`, `-m`, `x`, `-m`, `y`]);
      expect(
        scene.repo.runGitCommandAndGetOutput([`log`, `-1`, `--format=%B`])
      ).to.equal('x\n\ny');
      expect(
        scene.repo.runGitCommandAndGetOutput([`rev-list`, `--count`, `main..a`])
      ).to.equal('1');
    });

    it('Leaves a conflicting child needing a restack instead of halting', () => {
      scene.repo.createChange('a', 'x');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'x');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('a');
      // Rewrite a behind Charcoal's back so b would conflict when restacked.
      scene.repo.createChangeAndAmend('a-changed', 'x');
      scene.repo.createChangeAndCommit('a2', 'a2');

      scene.repo.runCliCommand([`squash`, `-n`]);

      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.currentBranchName()).to.equal('a');
      expectCommits(scene.repo, 'a, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).to.contain(
        'needs restack'
      );
    });
  });
}
