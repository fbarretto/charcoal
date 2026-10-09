import { expect } from 'chai';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): completion`, function () {
    configureTest(this, scene);

    it('Completes branch names for the commands that take one', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand(['create', 'feature-a', '-m', 'a']);
      for (const cmd of ['info', 'freeze', 'unfreeze', 'unlink', 'pr', 'utr']) {
        expect(
          scene.repo
            .runCliCommandAndGetOutput([
              '--get-yargs-completions',
              'ch',
              cmd,
              '',
            ])
            .split('\n'),
          cmd
        ).to.include('feature-a');
      }
    });
  });
}
