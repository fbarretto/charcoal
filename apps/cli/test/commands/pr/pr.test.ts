import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
import { CloneScene } from '../../lib/scenes/clone_scene';
import { FakeGh } from '../../lib/utils/fake_gh';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of allScenes) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): pr`, function () {
    configureTest(this, scene);

    // A fake `gh` on PATH records its arguments instead of opening a browser.
    let ghLog: string;
    let originalPath: string | undefined;
    beforeEach(() => {
      const binDir = tmp.dirSync().name;
      ghLog = path.join(binDir, 'gh.log');
      fs.writeFileSync(
        path.join(binDir, 'gh'),
        [
          '#!/bin/sh',
          `echo "$@" >> "${ghLog}"`,
          `case "$*" in *--json*) echo '{"url":"https://github.com/owner/name/pull/'$3'"}';; esac`,
        ].join('\n'),
        { mode: 0o755 }
      );
      originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;

      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
    });
    afterEach(() => {
      process.env.PATH = originalPath;
    });

    const setPrNumber = (branch: string, number: number) =>
      writeMetadataRef(
        branch,
        { ...readMetadataRef(branch, scene.dir), prInfo: { number } },
        scene.dir
      );
    const ghCalls = () =>
      fs.existsSync(ghLog)
        ? fs
            .readFileSync(ghLog, 'utf-8')
            .trim()
            .split('\n')
            .filter((c) => !c.startsWith('api ') && !c.includes('--json'))
        : [];

    it('Errors when the current branch has no PR', () => {
      expect(() => scene.repo.runCliCommand([`pr`])).to.throw();
      expect(ghCalls()).to.deep.equal([]);
    });

    it('Errors when a named branch has no PR', () => {
      setPrNumber('b', 2);
      expect(() => scene.repo.runCliCommand([`pr`, `a`])).to.throw();
      expect(ghCalls()).to.deep.equal([]);
    });

    it('Errors on an unknown branch', () => {
      expect(() => scene.repo.runCliCommand([`pr`, `nope`])).to.throw();
    });

    it('Opens the PR of the current branch, a named branch, or a number', () => {
      setPrNumber('a', 1);
      setPrNumber('b', 2);
      expect(scene.repo.runCliCommandAndGetOutput([`pr`])).to.equal(
        'https://github.com/owner/name/pull/2'
      );
      scene.repo.runCliCommand([`pr`, `a`]);
      scene.repo.runCliCommand([`pr`, `42`]);
      expect(ghCalls()).to.deep.equal([
        'pr view 2 --repo owner/name --web',
        'pr view 1 --repo owner/name --web',
        'pr view 42 --repo owner/name --web',
      ]);
    });

    it('Opens every PR in the stack, or none if one is missing', () => {
      setPrNumber('b', 2);
      scene.repo.checkoutBranch('a');
      expect(() => scene.repo.runCliCommand([`pr`, `--stack`])).to.throw();
      expect(ghCalls()).to.deep.equal([]);

      setPrNumber('a', 1);
      scene.repo.runCliCommand([`pr`, `--stack`]);
      expect(ghCalls()).to.deep.equal([
        'pr view 1 --repo owner/name --web',
        'pr view 2 --repo owner/name --web',
      ]);
    });
  });
}

{
  const scene = new CloneScene();
  describe(`(${scene}): pr --stack with a GitHub stack`, function () {
    configureTest(this, scene);
    const gh = new FakeGh();
    afterEach(() => gh.uninstall());

    it("Opens every PR of the branch's GitHub stack", () => {
      gh.install({
        prs: {
          a: { number: 1, headRefName: 'a', baseRefName: 'main' },
          x: { number: 7, headRefName: 'x', baseRefName: 'a' },
        },
        stacks: [{ number: 100, prs: [1, 7] }],
      });
      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { number: 1 } },
        scene.dir
      );

      expect(scene.repo.runCliCommandAndGetOutput([`pr`, `--stack`])).to.equal(
        'https://github.com/owner/name/pull/1\nhttps://github.com/owner/name/pull/7'
      );
      expect(gh.calls().filter((c) => c.endsWith('--web'))).to.deep.equal([
        'pr view 1 --repo owner/name --web',
        'pr view 7 --repo owner/name --web',
      ]);
    });
  });
}
