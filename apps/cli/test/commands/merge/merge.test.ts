import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { CloneScene } from '../../lib/scenes/clone_scene';
import { configureTest } from '../../lib/utils/configure_test';

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): merge`, function () {
    configureTest(this, scene);

    // A fake `gh` on PATH records its arguments; `pr merge N` squash-merges
    // branch N (a=1, b=2, c=3) into origin's main, unless N is FAKE_GH_FAIL.
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
          '[ "$1 $2" = "pr merge" ] || exit 0',
          '[ "$3" = "$FAKE_GH_FAIL" ] && exit 1',
          'branch=$(echo "a b c" | cut -d" " -f"$3")',
          `git -C "${scene.originDir}" merge -q --squash "$branch" >/dev/null`,
          `git -C "${scene.originDir}" commit -qm "$branch (#$3)"`,
        ].join('\n'),
        { mode: 0o755 }
      );
      originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;

      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
      ['a', 'b', 'c'].forEach((b) => {
        scene.repo.createChange(b, b);
        scene.repo.runCliCommand([`create`, b, `-m`, b]);
      });
      scene.repo.runGitCommand([`push`, `-q`, `origin`, `a`, `b`, `c`]);
    });
    afterEach(() => {
      process.env.PATH = originalPath;
      delete process.env.FAKE_GH_FAIL;
    });

    const setPrNumbers = (branches: string[]) =>
      branches.forEach((branch) =>
        writeMetadataRef(
          branch,
          {
            ...readMetadataRef(branch, scene.dir),
            prInfo: { number: ['a', 'b', 'c'].indexOf(branch) + 1 },
          },
          scene.dir
        )
      );
    const ghCalls = () =>
      fs.existsSync(ghLog)
        ? fs.readFileSync(ghLog, 'utf-8').trim().split('\n')
        : [];

    it('Prints the plan with --dry-run', () => {
      setPrNumbers(['a', 'b', 'c']);
      const output = scene.repo.runCliCommandAndGetOutput([
        `merge`,
        `--dry-run`,
      ]);
      expect(output).to.match(/#1 a\s+#2 b\s+#3 c/);
      expect(ghCalls()).to.deep.equal([]);
    });

    it('Refuses when a branch has no PR', () => {
      setPrNumbers(['a']);
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /No open PR for: b, c/
      );
      expect(ghCalls()).to.deep.equal([]);
    });

    it('Merges bottom-up, rebasing each next branch onto trunk', () => {
      setPrNumbers(['a', 'b', 'c']);
      scene.repo.runCliCommand([`merge`]);
      expect(ghCalls()).to.deep.equal([
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr merge 2 --repo owner/name --squash',
        'pr edit 3 --repo owner/name --base main',
        'pr merge 3 --repo owner/name --squash',
      ]);
      const log = (range: string) =>
        scene.originRepo.runGitCommandAndGetOutput([
          `log`,
          `--format=%s`,
          range,
        ]);
      expect(log(`-3`)).to.equal('c (#3)\nb (#2)\na (#1)');
      // c was pushed with only its own commit, on top of the squashed b.
      expect(log(`main~..c`)).to.equal('c');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('main');
    });

    it('Stops at the first PR that fails to merge', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_FAIL = '2';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /Stopped at #2 \(b\); left untouched: #3/
      );
      expect(ghCalls()).to.deep.equal([
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr merge 2 --repo owner/name --squash',
      ]);
    });

    it('Only enables auto-merge on the bottom PR with --auto', () => {
      setPrNumbers(['a', 'b', 'c']);
      scene.repo.runCliCommand([`merge`, `--auto`, `--method`, `rebase`]);
      expect(ghCalls()).to.deep.equal([
        'pr merge 1 --repo owner/name --rebase --auto',
      ]);
    });
  });
}
