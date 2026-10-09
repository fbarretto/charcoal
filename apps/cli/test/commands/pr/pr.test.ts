import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { allScenes } from '../../lib/scenes/all_scenes';
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
        `#!/bin/sh\necho "$@" >> "${ghLog}"\n`,
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
        ? fs.readFileSync(ghLog, 'utf-8').trim().split('\n')
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
      scene.repo.runCliCommand([`pr`]);
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
