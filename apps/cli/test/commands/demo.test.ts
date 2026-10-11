import { expect } from 'chai';
import fs from 'fs-extra';
import { GitRepo } from '../../src/lib/utils/git_repo';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): demo`, function () {
    configureTest(this, scene);

    it('Builds a local demo repo with no remote', () => {
      const output = scene.repo.runCliCommandAndGetOutput(['demo']);
      const demoDir = output.split('\n')[0].trim();
      try {
        const demo = new GitRepo(demoDir, { existingRepo: true });
        expect(demo.runGitCommandAndGetOutput(['remote'])).to.equal('');
        expect(demo.runGitCommandAndGetOutput(['branch'])).to.contain(
          'review_queue_frontend'
        );
        expect(output).to.contain('nothing is pushed');
      } finally {
        fs.removeSync(demoDir);
      }
    });
  });
}
