import { expect } from 'chai';
import { BasicScene } from '../../lib/scenes/basic_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): user restack-date`, function () {
    configureTest(this, scene);

    it('Shows the current setting without changing it', () => {
      scene.repo.runCliCommand([`user`, `restack-date`, `--use-author-date`]);
      expect(
        scene.repo.runCliCommandAndGetOutput([`user`, `restack-date`])
      ).to.equal(
        '`--committer-date-is-author-date` will be passed to the internal `git rebase`'
      );
      expect(
        scene.repo.runCliCommandAndGetOutput([`user`, `restack-date`])
      ).to.equal(
        '`--committer-date-is-author-date` will be passed to the internal `git rebase`'
      );

      scene.repo.runCliCommand([
        `user`,
        `restack-date`,
        `--no-use-author-date`,
      ]);
      expect(
        scene.repo.runCliCommandAndGetOutput([`user`, `restack-date`])
      ).to.equal(
        '`--committer-date-is-author-date` will not be passed to the internal `git rebase`'
      );
    });
  });
}
