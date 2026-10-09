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

const FAKE_GH = `
const fs = require('fs');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const input = args.includes('--input') ? fs.readFileSync(0, 'utf-8') : '';
fs.appendFileSync(process.env.FAKE_GH_LOG, [...args, input].join(' ').trim() + '\\n');
const fail = (msg) => { process.stderr.write(msg + '\\n'); process.exit(1); };
const out = (o) => process.stdout.write(JSON.stringify(o));
const stacked = process.env.FAKE_GH_STACK === '1';
const merge = (n) => {
  const branch = 'abc'[n - 1];
  const git = (...a) => execFileSync('git', ['-C', process.env.FAKE_GH_ORIGIN, ...a]);
  git('merge', '-q', '--squash', branch);
  git('commit', '-qm', branch + ' (#' + n + ')');
};
const [cmd, sub, id] = args;
// Retargeting a PR resets its mergeability to UNKNOWN until a later view.
const unknownPath = process.env.FAKE_GH_LOG + '.unknown';
const unknown = () => (fs.existsSync(unknownPath) ? fs.readFileSync(unknownPath, 'utf-8').split(',') : []);
const setUnknown = (ids) => fs.writeFileSync(unknownPath, ids.join(','));
if (cmd === 'pr' && sub === 'merge') {
  if (stacked) fail('GraphQL: This pull request is part of a stack and must be merged using the asynchronous merge REST API.');
  if (id === process.env.FAKE_GH_FAIL || unknown().includes(id)) fail('GraphQL: Pull Request is not mergeable');
  merge(Number(id));
  process.exit(0);
}
if (cmd === 'pr' && sub === 'edit' && stacked) fail('GraphQL: Cannot change the base branch because the pull request is part of a stack.');
if (cmd === 'pr' && sub === 'edit') { setUnknown([...unknown(), id]); process.exit(0); }
if (cmd === 'pr' && sub === 'view') {
  const pending = unknown().includes(id);
  setUnknown(unknown().filter((u) => u !== id));
  const blocked = id === process.env.FAKE_GH_BLOCKED;
  out(pending
    ? { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }
    : { mergeable: 'MERGEABLE', mergeStateStatus: blocked ? 'BLOCKED' : 'CLEAN' });
  process.exit(0);
}
if (cmd === 'pr') process.exit(0);
if (cmd === 'api' && sub.includes('/stacks?pull_request=')) {
  if (!stacked) fail('gh: Not Found (HTTP 404)');
  out([{ number: 9, open: true, pull_requests: [1, 2, 3].map((number) => ({ number, state: 'open' })) }]);
  process.exit(0);
}
let m;
if (cmd === 'api' && (m = /pulls\\/(\\d+)\\/merge-async$/.exec(sub))) {
  for (let n = 1; n <= Number(m[1]); n++) merge(n);
  out({ status: 'pending', details: { uuid: 'u' + m[1] } });
  process.exit(0);
}
if (cmd === 'api' && /merge-async\\/u\\d+$/.test(sub)) { out({ status: 'merged', details: { sha: 'abc' } }); process.exit(0); }
fail('fake gh: unexpected ' + args.join(' '));
`;

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): merge`, function () {
    configureTest(this, scene);

    // A fake `gh` on PATH logs its arguments. PRs 1-3 are branches a-c;
    // merging one squash-merges its branch into origin's main. With
    // FAKE_GH_STACK=1, PRs 1-3 form GitHub stack #9: GitHub then refuses
    // `pr merge`/`pr edit --base` on them and merges through merge-async.
    let ghLog: string;
    let originalPath: string | undefined;
    beforeEach(() => {
      const binDir = tmp.dirSync().name;
      ghLog = path.join(binDir, 'gh.log');
      fs.writeFileSync(
        path.join(binDir, 'gh'),
        `#!${process.execPath}\n${FAKE_GH}`,
        { mode: 0o755 }
      );
      process.env.FAKE_GH_LOG = ghLog;
      process.env.FAKE_GH_ORIGIN = scene.originDir;
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
      delete process.env.FAKE_GH_STACK;
      delete process.env.FAKE_GH_BLOCKED;
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
        'api repos/owner/name/stacks?pull_request=1',
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr view 2 --repo owner/name --json mergeable,mergeStateStatus',
        'pr view 2 --repo owner/name --json mergeable,mergeStateStatus',
        'pr merge 2 --repo owner/name --squash',
        'pr edit 3 --repo owner/name --base main',
        'pr view 3 --repo owner/name --json mergeable,mergeStateStatus',
        'pr view 3 --repo owner/name --json mergeable,mergeStateStatus',
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

    it('Is aliased as `mg`', () => {
      setPrNumbers(['a', 'b', 'c']);
      scene.repo.runCliCommand([`mg`, `--dry-run`]);
    });

    it('Refuses when local branches differ from remote and it cannot ask', () => {
      setPrNumbers(['a', 'b', 'c']);
      scene.repo.checkoutBranch('b');
      scene.repo.createChangeAndCommit('b2', 'b2');
      scene.repo.checkoutBranch('c');
      expect(() =>
        scene.repo.runCliCommand([`merge`, `--no-interactive`])
      ).to.throw(/differ from remote: .*b/);
      expect(ghCalls()).to.deep.equal([]);
    });

    it('Stops at the first PR that fails to merge', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_FAIL = '2';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /Stopped at #2 \(b\); left untouched: #3/
      );
      expect(ghCalls()).to.deep.equal([
        'api repos/owner/name/stacks?pull_request=1',
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr view 2 --repo owner/name --json mergeable,mergeStateStatus',
        'pr view 2 --repo owner/name --json mergeable,mergeStateStatus',
        'pr merge 2 --repo owner/name --squash',
      ]);
    });

    it('Stops with a clear message when a PR is blocked', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BLOCKED = '2';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /#2 is blocked by required checks or reviews/
      );
      expect(ghCalls()).not.to.contain('pr merge 2 --repo owner/name --squash');
    });

    it('Merges a GitHub stack through the async merge API', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      const output = scene.repo.runCliCommandAndGetOutput([`merge`]);
      expect(ghCalls()).to.deep.equal([
        'api repos/owner/name/stacks?pull_request=1',
        'api repos/owner/name/pulls/3/merge-async --method PUT --input - {"merge_method":"squash","merge_action":"default"}',
        'api repos/owner/name/pulls/3/merge-async/u3',
      ]);
      expect(output).to.match(/Merged #1 \(a\)[\s\S]*Merged #3 \(c\)/);
      expect(
        scene.originRepo.runGitCommandAndGetOutput([`log`, `--format=%s`, `-3`])
      ).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Refuses when the GitHub stack does not match the local stack', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      scene.repo.checkoutBranch('a');
      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { number: 2 } },
        scene.dir
      );
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /GitHub stack #9 \(#1, #2, #3\) does not match this stack \(#2\)/
      );
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
