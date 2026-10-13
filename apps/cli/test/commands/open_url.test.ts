import { expect } from 'chai';
import { browserCommand } from '../../src/lib/utils/open_url';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): docs and changelog`, function () {
    configureTest(this, scene);

    it('Picks the platform browser opener', () => {
      expect(browserCommand('darwin')).to.deep.equal(['open', []]);
      expect(browserCommand('linux')).to.deep.equal(['xdg-open', []]);
      expect(browserCommand('win32')[0]).to.equal('cmd');
    });

    for (const [command, url] of [
      ['docs', 'https://fbarretto.github.io/charcoal/'],
    ]) {
      it(`ch ${command} prints the URL without a terminal or with --no-open`, () => {
        expect(scene.repo.runCliCommandAndGetOutput([command])).to.equal(url);
        expect(
          scene.repo.runCliCommandAndGetOutput([command, '--no-open'])
        ).to.equal(url);
      });
    }
  });
}
