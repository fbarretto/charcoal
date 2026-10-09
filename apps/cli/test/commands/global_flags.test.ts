import { expect } from 'chai';
import os from 'os';
import { initContextLite } from '../../src/lib/context';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

function withTTY<T>(isTTY: boolean, fn: () => T): T {
  const [stdin, stdout] = [process.stdin.isTTY, process.stdout.isTTY];
  process.stdin.isTTY = isTTY;
  process.stdout.isTTY = isTTY;
  try {
    return fn();
  } finally {
    process.stdin.isTTY = stdin;
    process.stdout.isTTY = stdout;
  }
}

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): global flags`, function () {
    configureTest(this, scene);

    it('Infers interactivity from the terminal, --quiet and the flag', () => {
      expect(withTTY(true, () => initContextLite().interactive)).to.be.true;
      expect(withTTY(false, () => initContextLite().interactive)).to.be.false;
      expect(withTTY(true, () => initContextLite({ quiet: true }).interactive))
        .to.be.false;
      expect(
        withTTY(false, () => initContextLite({ interactive: true }).interactive)
      ).to.be.true;
      expect(
        withTTY(true, () => initContextLite({ interactive: false }).interactive)
      ).to.be.false;
    });

    it('Runs non-interactively when stdin/stdout are not terminals', () => {
      // Interactive `aliases` would open this failing editor.
      const saved = process.env.TEST_CH_EDITOR;
      process.env.TEST_CH_EDITOR = 'false';
      try {
        expect(() => scene.repo.runCliCommand([`aliases`])).not.to.throw();
        expect(() =>
          scene.repo.runCliCommand([`aliases`, `--interactive`])
        ).to.throw();
      } finally {
        if (saved === undefined) {
          delete process.env.TEST_CH_EDITOR;
        } else {
          process.env.TEST_CH_EDITOR = saved;
        }
      }
    });

    it('Runs in the --cwd directory', () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand(['--cwd', scene.dir, 'create', 'a', '-m', 'a'], {
        cwd: os.tmpdir(),
      });
      scene.repo.createChange('b');
      scene.repo.runCliCommand([`--cwd=${scene.dir}`, 'c', 'b', '-m', 'b'], {
        cwd: os.tmpdir(),
      });
      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(scene.repo.runCliCommandAndGetOutput(['parent'])).to.equal('a');
    });

    it('Accepts --help --all', () => {
      expect(
        scene.repo.runCliCommandAndGetOutput(['--help', '--all'])
      ).to.contain('ch create');
    });

    it('Honors GT_EDITOR and GT_PAGER, with CH_* taking precedence', () => {
      const saved = { ...process.env };
      try {
        process.env.GT_EDITOR = 'gt-editor';
        process.env.GT_PAGER = 'gt-pager';
        delete process.env.CH_EDITOR;
        delete process.env.CH_PAGER;
        const { userConfig } = initContextLite();
        expect(userConfig.getEditor()).to.equal('gt-editor');
        expect(userConfig.getPager()).to.equal('gt-pager');
        process.env.CH_EDITOR = 'ch-editor';
        expect(userConfig.getEditor()).to.equal('ch-editor');
      } finally {
        process.env = saved;
      }
    });
  });
}
