import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): auth`, function () {
    configureTest(this, scene);

    // A fake `gh` records its arguments and stdin.
    let ghLog: string;
    let originalPath: string | undefined;
    beforeEach(() => {
      const binDir = tmp.dirSync().name;
      ghLog = path.join(binDir, 'gh.log');
      fs.writeFileSync(
        path.join(binDir, 'gh'),
        [
          '#!/bin/sh',
          'if [ "$1" = "--version" ]; then echo "gh version 2.50.0"; exit 0; fi',
          `echo "args: $@" >> "${ghLog}"`,
          `if [ "$3" = "--with-token" ]; then echo "stdin: $(cat)" >> "${ghLog}"; fi`,
        ].join('\n'),
        { mode: 0o755 }
      );
      originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
    });
    afterEach(() => {
      process.env.PATH = originalPath;
    });

    it('Passes -t to `gh auth login --with-token` on stdin, never printing it', () => {
      const output = scene.repo.runCliCommandAndGetOutput([
        'auth',
        '-t',
        'secret-token',
      ]);
      expect(output).not.to.contain('secret-token');
      expect(fs.readFileSync(ghLog, 'utf-8').trim().split('\n')).to.deep.equal([
        'args: auth login --with-token',
        'stdin: secret-token',
      ]);
    });
  });
}
