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
const env = process.env;
// Per-PR state lives in files next to the log: <log>.<key>.
const file = (key) => env.FAKE_GH_LOG + '.' + key;
const has = (key) => fs.existsSync(file(key));
const touch = (key) => fs.writeFileSync(file(key), '');
const bump = (key) => { const n = (has(key) ? Number(fs.readFileSync(file(key), 'utf-8')) : 0) + 1; fs.writeFileSync(file(key), String(n)); return n; };
// Retargeting a PR resets its mergeability to UNKNOWN until a later view.
const unknownPath = file('unknown');
const unknown = () => (fs.existsSync(unknownPath) ? fs.readFileSync(unknownPath, 'utf-8').split(',') : []);
const setUnknown = (ids) => fs.writeFileSync(unknownPath, ids.join(','));
// Required checks: FAKE_GH_BLOCKED=<pr> pending forever, FAKE_GH_PENDING=<pr>:<n>
// pending for the first n reads, FAKE_GH_CHECK_FAIL=<pr> failed.
// FAKE_GH_REVIEW=<pr>: needs an approving review.
const [pendingPr, pendingReads] = (env.FAKE_GH_PENDING || ':').split(':');
const checksPending = (n) => n === env.FAKE_GH_BLOCKED || (n === pendingPr && !has('checked' + n));
const blocked = (n) => checksPending(n) || n === env.FAKE_GH_CHECK_FAIL || n === env.FAKE_GH_REVIEW;
const markMerged = (n) => { merge(Number(n)); touch('merged' + n); };
if (cmd === 'pr' && sub === 'checks') {
  if (id === pendingPr && bump('reads' + id) > Number(pendingReads)) touch('checked' + id);
  const check = checksPending(id)
    ? { name: 'slow-check', state: 'IN_PROGRESS', bucket: 'pending' }
    : id === env.FAKE_GH_CHECK_FAIL
    ? { name: 'slow-check', state: 'FAILURE', bucket: 'fail' }
    : { name: 'slow-check', state: 'SUCCESS', bucket: 'pass' };
  out([check]);
  process.exit(checksPending(id) ? 8 : check.bucket === 'fail' ? 1 : 0);
}
if (cmd === 'pr' && sub === 'merge') {
  const auto = args.includes('--auto');
  if (stacked && auto) fail('GraphQL: Auto-merge is not supported for stacked pull requests. (enablePullRequestAutoMerge)');
  if (stacked) fail('GraphQL: This pull request is part of a stack and must be merged using the asynchronous merge REST API.');
  if (id === env.FAKE_GH_FAIL || unknown().includes(id)) fail('GraphQL: Pull Request is not mergeable');
  // A blocked PR arms auto-merge; a direct merge is refused by the base
  // branch policy.
  if (auto && blocked(id)) { touch('armed' + id); process.exit(0); }
  if (blocked(id)) fail('X Pull request owner/name#' + id + ' is not mergeable: the base branch policy prohibits the merge.');
  // FAKE_GH_BASE_MODIFIED: GitHub's own retarget lands after mergeability
  // was computed, so the first merge attempt is refused.
  if (id === env.FAKE_GH_BASE_MODIFIED && !has('modified')) {
    touch('modified');
    fail('GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)');
  }
  markMerged(id);
  process.exit(0);
}
if (cmd === 'pr' && sub === 'edit' && stacked) fail('GraphQL: Cannot change the base branch because the pull request is part of a stack.');
// FAKE_GH_RETARGETED: GitHub already retargeted the PR when its base branch
// was deleted on merge, and refuses a redundant base edit.
if (cmd === 'pr' && sub === 'edit' && env.FAKE_GH_RETARGETED) {
  setUnknown([...unknown(), id]);
  fail("GraphQL: A pull request already exists for base branch 'main' and head branch '" + 'abc'[id - 1] + "' (updatePullRequest)");
}
if (cmd === 'pr' && sub === 'edit') { setUnknown([...unknown(), id]); process.exit(0); }
if (cmd === 'pr' && sub === 'view' && args.includes('baseRefName')) { out({ baseRefName: 'main' }); process.exit(0); }
if (cmd === 'pr' && sub === 'view') {
  const pending = unknown().includes(id);
  setUnknown(unknown().filter((u) => u !== id));
  // GitHub merges an armed PR on the FAKE_GH_AUTO_POLLS-th view (default 1)
  // after it stops being blocked.
  const armed = has('armed' + id);
  if (armed && !has('merged' + id) && !blocked(id) && bump('auto' + id) >= Number(env.FAKE_GH_AUTO_POLLS || 1)) markMerged(id);
  const merged = has('merged' + id);
  out({
    state: merged ? 'MERGED' : 'OPEN',
    isDraft: id === env.FAKE_GH_DRAFT,
    mergeable: pending ? 'UNKNOWN' : 'MERGEABLE',
    mergeStateStatus: pending ? 'UNKNOWN' : merged ? 'CLEAN' : blocked(id) ? 'BLOCKED' : 'CLEAN',
    reviewDecision: id === env.FAKE_GH_REVIEW ? 'REVIEW_REQUIRED' : '',
    autoMergeRequest: armed && !merged ? { mergeMethod: 'SQUASH' } : null,
  });
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
  if (!process.env.FAKE_GH_BLOCKED) for (let n = 1; n <= Number(m[1]); n++) merge(n);
  out({ status: 'pending', details: { uuid: 'u' + m[1] } });
  process.exit(0);
}
if (cmd === 'api' && /merge-async\\/u\\d+$/.test(sub)) {
  out(process.env.FAKE_GH_BLOCKED
    ? { status: 'failed', details: { message: 'Required status check "slow-check" is in progress.' } }
    : { status: 'merged', details: { sha: 'abc' } });
  process.exit(0);
}
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
      process.env.TEST_CH_MERGE_POLL_MS = '0';
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
      delete process.env.FAKE_GH_RETARGETED;
      delete process.env.FAKE_GH_BASE_MODIFIED;
      delete process.env.FAKE_GH_PENDING;
      delete process.env.FAKE_GH_DRAFT;
      delete process.env.FAKE_GH_CHECK_FAIL;
      delete process.env.FAKE_GH_REVIEW;
      delete process.env.FAKE_GH_AUTO_POLLS;
      delete process.env.TEST_CH_MERGE_POLL_MS;
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
        'pr view 1 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr merge 2 --repo owner/name --squash',
        'pr edit 3 --repo owner/name --base main',
        'pr view 3 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 3 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
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
        'pr view 1 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr merge 1 --repo owner/name --squash',
        'pr edit 2 --repo owner/name --base main',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr merge 2 --repo owner/name --squash',
      ]);
    });

    it('Carries on when GitHub already retargeted the next PR', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_RETARGETED = '1';
      scene.repo.runCliCommand([`merge`]);
      expect(
        scene.originRepo.runGitCommandAndGetOutput([`log`, `--format=%s`, `-3`])
      ).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Retries a merge GitHub refuses because the base just changed', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BASE_MODIFIED = '2';
      scene.repo.runCliCommand([`merge`]);
      expect(
        ghCalls().filter((c) => c === 'pr merge 2 --repo owner/name --squash')
      ).to.have.length(2);
      expect(
        scene.originRepo.runGitCommandAndGetOutput([`log`, `--format=%s`, `-3`])
      ).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Stops at a PR that is not ready with --no-wait', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BLOCKED = '2';
      expect(() => scene.repo.runCliCommand([`merge`, `--no-wait`])).to.throw(
        /#2 is still waiting on required checks: slow-check \(in progress\)/
      );
      expect(ghCalls()).not.to.contain('pr merge 2 --repo owner/name --squash');
    });

    it('Merges a GitHub stack through the async merge API', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      const output = scene.repo.runCliCommandAndGetOutput([`merge`]);
      expect(ghCalls()).to.deep.equal([
        'api repos/owner/name/stacks?pull_request=1',
        'pr view 1 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 3 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
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

    it('Only enables auto-merge on the bottom PR with --auto --no-wait', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BLOCKED = '1';
      const output = scene.repo.runCliCommandAndGetOutput([
        `merge`,
        `--auto`,
        `--no-wait`,
        `--method`,
        `rebase`,
      ]);
      expect(ghCalls()).to.deep.equal([
        'api repos/owner/name/stacks?pull_request=1',
        'pr view 1 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr merge 1 --repo owner/name --rebase --auto',
      ]);
      expect(output).to.match(/Enabled auto-merge for #1 \(a\)/);
    });

    it('Stops at the bottom PR when it is not ready with --no-wait', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BLOCKED = '1';
      expect(() => scene.repo.runCliCommand([`merge`, `--no-wait`])).to.throw(
        /#1 is still waiting on required checks/
      );
      expect(ghCalls()).not.to.contain('pr merge 1 --repo owner/name --squash');
    });

    it('Merges a GitHub stack through the async merge API with --auto', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      scene.repo.runCliCommand([`merge`, `--auto`]);
      expect(ghCalls()).to.deep.equal([
        'api repos/owner/name/stacks?pull_request=1',
        'pr view 1 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 2 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'pr view 3 --repo owner/name --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
        'api repos/owner/name/pulls/3/merge-async --method PUT --input - {"merge_method":"squash","merge_action":"default"}',
        'api repos/owner/name/pulls/3/merge-async/u3',
      ]);
      expect(
        scene.originRepo.runGitCommandAndGetOutput([`log`, `--format=%s`, `-3`])
      ).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Explains that GitHub has no auto-merge for a blocked GitHub stack', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      process.env.FAKE_GH_BLOCKED = '1';
      expect(() =>
        scene.repo.runCliCommand([`merge`, `--auto`, `--no-wait`])
      ).to.throw(
        /"slow-check" is in progress[\s\S]*GitHub does not support auto-merge for stacked PRs/
      );
    });
    const originLog = () =>
      scene.originRepo.runGitCommandAndGetOutput([`log`, `--format=%s`, `-3`]);

    it('Waits for pending required checks, then merges', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_PENDING = '2:2';
      const output = scene.repo.runCliCommandAndGetOutput([`merge`]);
      expect(output).to.match(
        /#2 waiting on required checks: slow-check \(in progress\)/
      );
      expect(
        ghCalls().filter((c) => c.startsWith('pr checks 2 '))
      ).to.have.length(3);
      expect(originLog()).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Gives up on a PR after --timeout minutes', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_BLOCKED = '1';
      expect(() =>
        scene.repo.runCliCommand([`merge`, `--timeout`, `0.001`])
      ).to.throw(
        /#1 was still waiting on required checks: slow-check \(in progress\) after 0.001 minutes/
      );
      expect(ghCalls()).not.to.contain('pr merge 1 --repo owner/name --squash');
    });

    it('Stops on a failing required check', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_CHECK_FAIL = '2';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /Stopped at #2 \(b\); left untouched: #3; already merged: #1\.[\s\S]*#2 failed required checks: slow-check \(failure\)/
      );
      expect(ghCalls()).not.to.contain('pr merge 2 --repo owner/name --squash');
    });

    it('Stops when a PR needs an approving review', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_REVIEW = '1';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /#1 needs an approving review/
      );
      expect(ghCalls()).not.to.contain('pr merge 1 --repo owner/name --squash');
    });

    it('Stops at a draft PR', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_DRAFT = '1';
      expect(() => scene.repo.runCliCommand([`merge`])).to.throw(
        /#1 is a draft; run `ch submit --publish`/
      );
      expect(ghCalls()).not.to.contain('pr merge 1 --repo owner/name --squash');
    });

    it('Merges the whole stack through auto-merge with --auto', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_PENDING = '1:1';
      process.env.FAKE_GH_AUTO_POLLS = '3';
      const output = scene.repo.runCliCommandAndGetOutput([`merge`, `--auto`]);
      expect(output).to.match(
        /Enabled auto-merge for #1 \(a\); waiting for GitHub to merge it[\s\S]*#1 waiting on required checks[\s\S]*#1 waiting for GitHub to merge it[\s\S]*Merged #1 \(a\)[\s\S]*Merged #3 \(c\)/
      );
      expect(
        ghCalls().filter((c) => c.endsWith('--squash --auto'))
      ).to.deep.equal(
        [1, 2, 3].map((n) => `pr merge ${n} --repo owner/name --squash --auto`)
      );
      expect(originLog()).to.equal('c (#3)\nb (#2)\na (#1)');
    });

    it('Waits for an approving review with --auto, leaving auto-merge on', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_REVIEW = '1';
      expect(() =>
        scene.repo.runCliCommand([`merge`, `--auto`, `--timeout`, `0.001`])
      ).to.throw(
        /auto-merge is still enabled on #1\.[\s\S]*#1 was still waiting on an approving review after/
      );
    });

    it('Waits for a GitHub stack to be ready before merging it', () => {
      setPrNumbers(['a', 'b', 'c']);
      process.env.FAKE_GH_STACK = '1';
      process.env.FAKE_GH_PENDING = '1:1';
      const output = scene.repo.runCliCommandAndGetOutput([`merge`]);
      expect(output).to.match(/#1 waiting on required checks/);
      expect(originLog()).to.equal('c (#3)\nb (#2)\na (#1)');
    });
  });
}
