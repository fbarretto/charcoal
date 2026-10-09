import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import {
  DEFAULT_ALIASES,
  LEGACY_ALIASES,
} from '../../../src/lib/pre-yargs/aliases';
import { BasicScene } from '../../lib/scenes/basic_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): aliases`, function () {
    configureTest(this, scene);

    const aliasFile = () => path.join(scene.dir, '.git', 'aliases');

    it('Expands an alias and appends the remaining arguments', () => {
      fs.writeFileSync(aliasFile(), '# comment\nnb create --all\n');
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`nb`, `a`, `-m`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
    });

    it('Ignores an alias that shadows a built-in command', () => {
      fs.writeFileSync(aliasFile(), 'ls create shadowed -m x\n');
      const output = scene.repo.runCliCommandAndGetOutput([`ls`]);
      expect(output).to.contain('Ignoring alias "ls"');
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Prints, resets, and installs legacy aliases', () => {
      fs.writeFileSync(aliasFile(), 'bc my-own-thing\n');
      scene.repo.runCliCommand([`aliases`, `--legacy`]);
      const printed = scene.repo.runCliCommandAndGetOutput([
        `aliases`,
        `--no-interactive`,
      ]);
      expect(printed).to.contain('bc my-own-thing');
      expect(printed).not.to.contain('bc create');
      expect(printed).to.contain('# GRAPHITE LEGACY PRESET');
      expect(printed).to.contain('be modify --interactive-rebase');

      scene.repo.runCliCommand([`aliases`, `--reset`]);
      expect(fs.readFileSync(aliasFile(), 'utf-8')).to.equal(DEFAULT_ALIASES);
    });

    it('Seeds the defaults, recreating a deleted file', () => {
      fs.removeSync(aliasFile());
      expect(
        scene.repo.runCliCommandAndGetOutput([`aliases`, `--no-interactive`])
      ).to.contain('ss submit --stack');
      expect(fs.readFileSync(aliasFile(), 'utf-8')).to.equal(DEFAULT_ALIASES);
      // The built-in `ls` is not reported as shadowed by its default alias.
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'Ignoring alias'
      );
    });

    it('`ss` is a default alias even when the file omits it', () => {
      fs.writeFileSync(aliasFile(), '# nothing here\n');
      expect(scene.repo.runCliCommandAndGetOutput([`ss`, `--help`])).to.contain(
        'ch submit'
      );
    });

    it('Migrates a legacy .graphite_aliases file once', () => {
      fs.removeSync(aliasFile());
      const legacy = path.join(scene.dir, '.git', '.graphite_aliases');
      fs.writeFileSync(legacy, 'nb create --all\n');
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`nb`, `a`, `-m`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      expect(fs.existsSync(legacy)).to.be.false;
      expect(fs.readFileSync(aliasFile(), 'utf-8')).to.equal(
        'nb create --all\n'
      );
    });

    it('Every legacy alias resolves to a command and shadows nothing', () => {
      scene.repo.runCliCommand([`aliases`, `--legacy`]);
      for (const line of LEGACY_ALIASES.split('\n')) {
        const name = line.split(' ')[0];
        const output = scene.repo.runCliCommandAndGetOutput([name, `--help`]);
        expect(output, name).not.to.contain('Ignoring alias');
        expect(output, name).to.contain(`ch ${line.split(' ')[1]}`);
      }
    });

    it('Legacy navigation aliases work', () => {
      scene.repo.runCliCommand([`aliases`, `--legacy`]);
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`bc`, `a`, `-am`, `a`]);
      scene.repo.runCliCommand([`bd`]);
      expect(scene.repo.currentBranchName()).to.equal('main');
      scene.repo.runCliCommand([`bu`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
    });
  });
}
