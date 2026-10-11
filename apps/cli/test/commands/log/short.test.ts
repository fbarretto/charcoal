import { expect } from 'chai';
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { USER_CONFIG_OVERRIDE_ENV } from '../../../src/lib/context';
import fs from 'fs-extra';
import stripAnsi from 'strip-ansi';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { TrailingProdScene } from '../../lib/scenes/trailing_prod_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new TrailingProdScene()]) {
  describe(`(${scene}): log short`, function () {
    configureTest(this, scene);

    it('Can log short', () => {
      expect(() => scene.repo.runCliCommand([`ls`])).to.not.throw(Error);
    });

    it('Ends every log style with a newline, even through a pager', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      for (const args of [['ls'], ['log', 'short'], ['log'], ['ll']]) {
        const out = spawnSync(
          process.execPath,
          [path.join(__dirname, '../../../src/index.js'), ...args],
          {
            cwd: scene.repo.dir,
            encoding: 'utf-8',
            env: {
              ...process.env,
              [USER_CONFIG_OVERRIDE_ENV]: scene.repo.userConfigPath,
              GT_PAGER: 'cat',
            },
          }
        ).stdout;
        expect(out, args.join(' ')).to.contain('main').and.match(/\n$/);
      }
    });

    it('`log --classic` matches `ls --classic`', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const classic = scene.repo.runCliCommandAndGetOutput([`ls`, `--classic`]);
      expect(classic).to.contain('a');
      expect(
        scene.repo.runCliCommandAndGetOutput([`log`, `--classic`])
      ).to.equal(classic);
      expect(scene.repo.runCliCommandAndGetOutput([`log`])).not.to.equal(
        classic
      );
    });

    it('Colors each stack on its own and grays out trunk', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('a2', 'a2');
      scene.repo.runCliCommand([`create`, `a2`, `-m`, `a2`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      const out = spawnSync(
        process.execPath,
        [path.join(__dirname, '../../../src/index.js'), 'ls'],
        {
          cwd: scene.repo.dir,
          encoding: 'utf-8',
          env: {
            ...process.env,
            [USER_CONFIG_OVERRIDE_ENV]: scene.repo.userConfigPath,
            FORCE_COLOR: '3',
          },
        }
      ).stdout;
      const colorOf = (name: string) =>
        // eslint-disable-next-line no-control-regex
        out.match(new RegExp(`(\x1b\[[0-9;]+m)${name}\x1b`))?.[1];
      expect(colorOf('a')).to.equal(colorOf('a2'));
      expect(colorOf('a')).to.not.equal(colorOf('b'));
      expect(colorOf('main')).to.equal('\x1b[90m');
    });

    it('Flags merged and closed PRs', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { state: 'MERGED' } },
        scene.dir
      );
      writeMetadataRef(
        'b',
        { ...readMetadataRef('b', scene.dir), prInfo: { state: 'CLOSED' } },
        scene.dir
      );
      const out = stripAnsi(scene.repo.runCliCommandAndGetOutput([`ls`]));
      expect(out).to.match(/ b \(closed\)/).and.match(/ a \(merged\)/);
    });

    it("Can print stacks if a branch's parent has been deleted", () => {
      // This is mostly an effort to recreate a messed-up repo state that created a bug for a user.
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.checkoutBranch('main');
      scene.repo.createChangeAndCommit('2', '2');
      scene.repo.checkoutBranch('a');
      execSync(`git -C ${scene.repo.dir} rebase prod`);

      // b's now has no git-parents, but it's meta points to "a" which still exists but is not off main.
      expect(() => scene.repo.runCliCommand([`ls`])).to.not.throw(Error);
    });

    it('Doesnt error when creating an empty branch because of empty commits', () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      expect(() => scene.repo.runCliCommand([`ls`])).to.not.throw(Error);
    });

    it('Works if branch and file have same name', () => {
      const textFileName = 'test.txt';
      scene.repo.runCliCommand([`create`, textFileName, `-m`, `a`]);

      // Creates a commit with contents "a" in file "test.txt"
      scene.repo.createChangeAndCommit('a');
      expect(fs.existsSync(textFileName)).to.be.true;

      scene.repo.checkoutBranch(textFileName);

      // gt log should work - using "test.txt" as a revision rather than a path
      expect(() => scene.repo.runCliCommand([`log`])).to.not.throw(Error);
      expect(() => scene.repo.runCliCommand([`ls`])).to.not.throw(Error);
    });
  });
}
