import { expect } from 'chai';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of allScenes) {
  describe(`(${scene}): split --by-file`, function () {
    configureTest(this, scene);

    function changedFiles(range: string): string {
      return scene.repo
        .runGitCommandAndGetOutput([`diff`, `--name-only`, range])
        .split('\n')
        .sort()
        .join(', ');
    }

    it('Moves matching files into a new parent branch and restacks children', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.createChange('x', 'x');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a1`]);
      scene.repo.createChange('a2', 'a');
      scene.repo.createChange('y', 'y');
      scene.repo.runGitCommand([`commit`, `-m`, `a2`]);
      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`]);
      scene.repo.checkoutBranch('a');
      const treeBefore = scene.repo.runGitCommandAndGetOutput([
        `rev-parse`,
        `a^{tree}`,
      ]);

      scene.repo.runCliCommand([
        `split`,
        `--by-file`,
        `x_test.txt`,
        `-f`,
        `y_*`,
        `--no-interactive`,
      ]);

      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(
        scene.repo.runGitCommandAndGetOutput([`rev-parse`, `a^{tree}`])
      ).to.equal(treeBefore);
      expect(changedFiles('main..a_split')).to.equal('x_test.txt, y_test.txt');
      expect(changedFiles('a_split..a')).to.equal('a_test.txt');
      expectCommits(scene.repo, 'a2, a1, a1, a2, 1');

      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal('a_split');
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal('main');

      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, a2, a1, a1, a2, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'needs restack'
      );
    });

    it('Drops commits that only touched the split files', () => {
      scene.repo.createChange('x', 'x');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `x`]);
      scene.repo.createChange('a', 'a');
      scene.repo.runGitCommand([`commit`, `-m`, `a`]);

      scene.repo.runCliCommand([
        `split`,
        `-f`,
        `x_test.txt`,
        `--no-interactive`,
      ]);

      expectCommits(scene.repo, 'a, x, a, 1');
      expect(changedFiles('a_split..a')).to.equal('a_test.txt');
    });

    it('Refuses when nothing or everything matches', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const aBefore = scene.repo.getRef('refs/heads/a');

      expect(() =>
        scene.repo.runCliCommand([
          `split`,
          `-f`,
          `nope.txt`,
          `--no-interactive`,
        ])
      ).to.throw();
      expect(() =>
        scene.repo.runCliCommand([
          `split`,
          `-f`,
          `a_test.txt`,
          `--no-interactive`,
        ])
      ).to.throw();
      expect(scene.repo.getRef('refs/heads/a')).to.equal(aBefore);
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'a_split'
      );
    });

    it('Can be undone', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.createChange('x', 'x');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const aBefore = scene.repo.getRef('refs/heads/a');

      scene.repo.runCliCommand([
        `split`,
        `-f`,
        `x_test.txt`,
        `--no-interactive`,
      ]);
      scene.repo.runCliCommand([`undo`, `-f`]);

      expect(scene.repo.getRef('refs/heads/a')).to.equal(aBefore);
      expect(scene.repo.getRef('refs/heads/a_split')).to.equal('');
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.runCliCommand([`down`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });
  });
}
