import { expect } from 'chai';
import { BasicScene } from '../../lib/scenes/basic_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): repo github-stacks`, function () {
    configureTest(this, scene);

    it('Prints and toggles the githubStacks repo setting', () => {
      const run = (args: string[]) =>
        scene.repo.runCliCommandAndGetOutput([
          'repo',
          'github-stacks',
          ...args,
        ]);
      expect(run([])).to.contain('enabled');
      expect(run(['--disable'])).to.contain('disabled');
      expect(run([])).to.contain('disabled');
      expect(
        scene.repo.runCliCommandAndGetOutput(['config', '--no-interactive'])
      ).to.contain('repo github-stacks: disabled');
      expect(run(['--enable'])).to.contain('enabled');
      expect(run([])).to.contain('enabled');
    });
  });
}
