import { expect } from 'chai';
import { detectInstall } from '../../src/actions/upgrade';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): upgrade`, function () {
    configureTest(this, scene);

    it('Detects a Homebrew install from the binary in the Cellar', () => {
      for (const execPath of [
        '/opt/homebrew/Cellar/charcoal/1.1.7/bin/ch',
        '/usr/local/Cellar/charcoal/1.1.7/bin/ch',
        '/home/linuxbrew/.linuxbrew/Cellar/charcoal/1.1.7/bin/ch',
      ]) {
        expect(detectInstall({ execPath, scriptPath: undefined })).to.equal(
          'homebrew'
        );
      }
    });

    it('Detects a global npm install from the script node runs', () => {
      expect(
        detectInstall({
          execPath: '/usr/local/bin/node',
          scriptPath:
            '/usr/local/lib/node_modules/@fbarretto/charcoal/dist/src/index.js',
        })
      ).to.equal('npm');
    });

    it('Falls back to unknown for a downloaded binary or a source checkout', () => {
      expect(
        detectInstall({
          execPath: '/Users/me/.local/bin/ch',
          scriptPath: '/Users/me/.local/bin/ch',
        })
      ).to.equal('unknown');
      expect(
        detectInstall({
          execPath: '/usr/local/bin/node',
          scriptPath: '/Users/me/src/charcoal/apps/cli/dist/src/index.js',
        })
      ).to.equal('unknown');
    });

    it('Prints both upgrade commands when it cannot tell', () => {
      const output = scene.repo.runCliCommandAndGetOutput([`upgrade`]);
      expect(output).to.contain('brew upgrade charcoal');
      expect(output).to.contain('npm i -g @fbarretto/charcoal');
    });
  });
}
