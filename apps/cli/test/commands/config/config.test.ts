import { expect } from 'chai';
import { BasicScene } from '../../lib/scenes/basic_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): config`, function () {
    configureTest(this, scene);

    it('Prints user and repo settings when non-interactive', () => {
      scene.repo.runCliCommand([`user`, `branch-prefix`, `--set`, `abc-`]);
      scene.repo.runCliCommand([`repo`, `remote`, `--set`, `upstream`]);
      const output = scene.repo.runCliCommandAndGetOutput([
        `config`,
        `--no-interactive`,
      ]);
      expect(output).to.contain('user branch-prefix: abc-');
      expect(output).to.contain('user tips: disabled');
      expect(output).to.contain('repo remote: upstream');
      expect(output).to.contain('repo github: disabled');
      expect(output).to.contain('repo github-stacks: enabled');
    });
  });
}
