import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

const skillSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'skills',
    'charcoal',
    'SKILL.md'
  ),
  'utf-8'
);

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): skill`, function () {
    configureTest(this, scene);

    let home: string;
    let originalHome: string | undefined;
    beforeEach(() => {
      originalHome = process.env.HOME;
      home = tmp.dirSync().name;
      process.env.HOME = home;
    });
    afterEach(() => {
      process.env.HOME = originalHome;
    });

    const userSkill = () =>
      path.join(home, '.claude', 'skills', 'charcoal', 'SKILL.md');

    it('Installs the skill into ~/.claude/skills', () => {
      expect(
        scene.repo.runCliCommandAndGetOutput([`skill`, `install`])
      ).to.contain('Installed the Charcoal skill');
      expect(fs.readFileSync(userSkill(), 'utf-8')).to.equal(skillSource);
    });

    it('Says it is up to date when the same skill is installed, and updates an older one', () => {
      scene.repo.runCliCommand([`skill`, `install`]);
      expect(
        scene.repo.runCliCommandAndGetOutput([`skill`, `install`])
      ).to.contain('already up to date');

      fs.writeFileSync(userSkill(), 'old');
      expect(
        scene.repo.runCliCommandAndGetOutput([`skill`, `install`])
      ).to.contain('Updated the Charcoal skill');
      expect(fs.readFileSync(userSkill(), 'utf-8')).to.equal(skillSource);
    });

    it('Installs into the repository with --project', () => {
      scene.repo.runCliCommand([`skill`, `install`, `--project`]);
      expect(
        fs.readFileSync(
          path.join(scene.dir, '.claude', 'skills', 'charcoal', 'SKILL.md'),
          'utf-8'
        )
      ).to.equal(skillSource);
      expect(fs.existsSync(userSkill())).to.be.false;
    });

    it('Prints the skill', () => {
      expect(scene.repo.runCliCommandAndGetOutput([`skill`, `print`])).to.equal(
        skillSource.trim()
      );
    });
  });
}
