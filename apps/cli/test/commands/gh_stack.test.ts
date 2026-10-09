import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { CloneScene } from '../lib/scenes/clone_scene';
import { configureTest } from '../lib/utils/configure_test';

// A fake `gh` that emulates PRs and GitHub's stacks REST API from a JSON state
// file, logging every `gh api` call (with its stdin body) for assertions.
const FAKE_GH = `
const fs = require('fs');
const [statePath, logPath] = [process.env.FAKE_GH_STATE, process.env.FAKE_GH_LOG];
const args = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
const save = () => fs.writeFileSync(statePath, JSON.stringify(st));
const out = (o) => process.stdout.write(JSON.stringify(o));
const fail = (msg) => { process.stderr.write(msg + '\\n'); process.exit(1); };
const url = (n) => 'https://github.com/owner/name/pull/' + n;
const flag = (f) => args[args.indexOf(f) + 1];

if (args[0] === '--version') { console.log('gh version 2.80.0'); process.exit(0); }
if (args[0] === 'auth') process.exit(0);
if (args[0] === 'pr' && args[1] === 'view') {
  const pr = Object.values(st.prs).find((p) => String(p.number) === args[2] || p.headRefName === args[2]);
  if (!pr) fail('no pull requests found for branch "' + args[2] + '"');
  out({ state: 'OPEN', ...pr, url: url(pr.number), title: 't', body: '', reviewDecision: '', isDraft: false });
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  const n = st.nextPr++;
  st.prs[flag('--head')] = { number: n, headRefName: flag('--head'), baseRefName: flag('--base') };
  save();
  console.log(url(n));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'edit') {
  if (args.includes('--base')) {
    const pr = Object.values(st.prs).find((p) => p.headRefName === args[2] || String(p.number) === args[2]);
    if (st.stacks.some((s) => s.prs.includes(pr.number))) {
      fail('GraphQL: Cannot change the base branch because the pull request is part of a stack. (updatePullRequest)');
    }
    pr.baseRefName = flag('--base');
    save();
  }
  process.exit(0);
}
if (args[0] === 'api') {
  const input = args.includes('--input') ? fs.readFileSync(0, 'utf-8') : '';
  fs.appendFileSync(logPath, [...args, input].join(' ').trim() + '\\n');
  if (st.status === 404) fail('gh: Not Found (HTTP 404)');
  if (st.status) fail('gh: Server Error (HTTP ' + st.status + ')');
  const body = input ? JSON.parse(input) : {};
  const done = (n) => ['MERGED', 'CLOSED'].includes(Object.values(st.prs).find((p) => p.number === n)?.state);
  const view = (s) => ({ number: s.number, open: true, pull_requests: s.prs.map((number) => ({ number, state: done(number) ? 'closed' : 'open' })) });
  const [p, query] = args[1].split('?');
  const find = (n) => st.stacks.find((s) => s.number === Number(n));
  let m;
  if (query) {
    const pr = Number(query.split('=')[1]);
    out(st.stacks.filter((s) => s.prs.includes(pr)).map(view));
  } else if (p.endsWith('/stacks')) {
    const s = { number: st.nextStack++, prs: body.pull_requests };
    st.stacks.push(s);
    out(view(s));
  } else if ((m = /stacks\\/(\\d+)\\/add$/.exec(p))) {
    find(m[1]).prs.push(...body.pull_requests);
    out(view(find(m[1])));
  } else if ((m = /stacks\\/(\\d+)\\/unstack$/.exec(p))) {
    // GitHub keeps queued and already-merged PRs in the stack.
    const kept = find(m[1]).prs.filter((n) => st.queued.includes(n) || done(n));
    st.stacks = st.stacks.filter((s) => s.number !== Number(m[1]));
    if (kept.length) {
      st.stacks.push({ number: Number(m[1]), prs: kept });
      out(view({ number: Number(m[1]), prs: kept }));
    }
  }
  save();
  process.exit(0);
}
fail('fake gh: unexpected ' + args.join(' '));
`;

type TState = {
  prs: Record<string, { number: number; baseRefName?: string; state?: string }>;
  nextPr: number;
  stacks: { number: number; prs: number[] }[];
  nextStack: number;
  queued: number[];
  status?: number;
};

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): GitHub stacks`, function () {
    configureTest(this, scene);

    let statePath: string;
    let logPath: string;
    let originalPath: string | undefined;
    beforeEach(() => {
      const binDir = tmp.dirSync().name;
      statePath = path.join(binDir, 'state.json');
      logPath = path.join(binDir, 'gh.log');
      fs.writeFileSync(
        path.join(binDir, 'gh'),
        `#!${process.execPath}\n${FAKE_GH}`,
        { mode: 0o755 }
      );
      writeState({
        prs: {},
        nextPr: 1,
        stacks: [],
        nextStack: 100,
        queued: [],
      });
      originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
      process.env.FAKE_GH_STATE = statePath;
      process.env.FAKE_GH_LOG = logPath;

      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
      createBranches(['a', 'b']);
    });
    afterEach(() => {
      process.env.PATH = originalPath;
    });

    const readState = (): TState =>
      JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const writeState = (s: TState) =>
      fs.writeFileSync(statePath, JSON.stringify(s));
    const editState = (f: (s: TState) => void) => {
      const s = readState();
      f(s);
      writeState(s);
    };
    const apiCalls = () =>
      fs.existsSync(logPath)
        ? fs.readFileSync(logPath, 'utf-8').trim().split('\n')
        : [];
    const createBranches = (names: string[]) =>
      names.forEach((n) => {
        scene.repo.createChange(n, n);
        scene.repo.runCliCommand([`create`, n, `-m`, n]);
      });
    const submit = (...flags: string[]) => {
      fs.rmSync(logPath, { force: true });
      return scene.repo.runCliCommandAndGetOutput([
        `submit`,
        `--no-interactive`,
        ...flags,
      ]);
    };
    const prOf = (branch: string) => readState().prs[branch]?.number;
    const GET = (pr: number) =>
      `api repos/owner/name/stacks?pull_request=${pr}`;
    const CREATE = (prs: number[]) =>
      `api repos/owner/name/stacks --method POST --input - {"pull_requests":${JSON.stringify(
        prs
      )}}`;

    it('creates a stack, then adds new PRs to it', () => {
      submit();
      expect(apiCalls()).to.deep.equal([GET(1), CREATE([1, 2])]);
      expect(readState().stacks).to.deep.equal([{ number: 100, prs: [1, 2] }]);

      const ls = scene.repo.runCliCommandAndGetOutput([`ls`]);
      expect(ls).to.match(/ a \(stack #100\)/);
      expect(ls).not.to.match(/ b \(stack/);
      expect(scene.repo.runCliCommandAndGetOutput([`log`])).to.contain(
        'stack #100'
      );

      createBranches(['c']);
      submit();
      expect(apiCalls()).to.deep.equal([
        GET(1),
        'api repos/owner/name/stacks/100/add --method POST --input - {"pull_requests":[3]}',
      ]);
      expect(readState().stacks).to.deep.equal([
        { number: 100, prs: [1, 2, 3] },
      ]);

      // Already linked: one lookup, no writes.
      submit();
      expect(apiCalls()).to.deep.equal([GET(1)]);
    });

    it('unstacks and recreates a stack that no longer matches', () => {
      submit(`--no-gh-stack`);
      editState((s) => s.stacks.push({ number: 7, prs: [2, 1] }));
      submit();
      expect(apiCalls()).to.deep.equal([
        GET(1),
        'api repos/owner/name/stacks/7/unstack --method POST',
        CREATE([1, 2]),
      ]);
      expect(readState().stacks).to.deep.equal([{ number: 100, prs: [1, 2] }]);
    });

    it('unstacks before changing the base of a stacked PR, then relinks', () => {
      submit();
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('ins', 'ins');
      scene.repo.runCliCommand([`create`, `ins`, `-m`, `ins`, `--insert`]);
      const output = submit(`--stack`);
      expect(apiCalls()).to.deep.equal([
        GET(2),
        'api repos/owner/name/stacks/100/unstack --method POST',
        GET(1),
        CREATE([1, 3, 2]),
      ]);
      expect(readState().prs['b'].baseRefName).to.equal('ins');
      expect(output).to.contain('Unstacked GitHub stack #100');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).to.match(
        / a \(stack #101\)/
      );
    });

    it('fails before pushing when GitHub keeps a retargeted PR stacked', () => {
      submit();
      editState((s) => (s.queued = [2]));
      scene.repo.checkoutBranch('a');
      scene.repo.createChange('ins', 'ins');
      scene.repo.runCliCommand([`create`, `ins`, `-m`, `ins`, `--insert`]);
      fs.rmSync(logPath, { force: true });
      expect(() =>
        scene.repo.runCliCommand([`submit`, `--no-interactive`, `--stack`])
      ).to.throw(/nothing was pushed\. GitHub kept #2 stacked/);
      expect(prOf('ins')).to.equal(undefined);
    });

    it('keeps a stack whose bottom PR merged, comparing only open PRs', () => {
      createBranches(['c']);
      submit();
      editState((s) => {
        s.prs['a'].state = 'MERGED';
        s.prs['b'].baseRefName = 'main';
      });
      scene.repo.runCliCommand([`move`, `main`, `--source`, `b`]);
      const output = submit(`--stack`);
      expect(apiCalls()).to.deep.equal([GET(2)]);
      expect(output).not.to.contain('WARNING');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).to.match(
        / b \(stack #100\)/
      );
    });

    it('relinks when GitHub keeps only merged PRs after unstacking', () => {
      submit(`--no-gh-stack`);
      editState((s) => {
        s.prs['z'] = { number: 9, state: 'MERGED' };
        s.stacks.push({ number: 7, prs: [9, 2, 1] });
      });
      const output = submit();
      expect(apiCalls()).to.deep.equal([
        GET(1),
        'api repos/owner/name/stacks/7/unstack --method POST',
        CREATE([1, 2]),
      ]);
      expect(output).not.to.contain('queued for merge');
    });

    it('makes no call for a single-PR chain', () => {
      scene.repo.checkoutBranch('a');
      submit();
      expect(prOf('a')).to.equal(1);
      expect(apiCalls()).to.deep.equal([]);
    });

    it('skips silently when stacked PRs are not enabled (404)', () => {
      editState((s) => (s.status = 404));
      const output = submit();
      expect(prOf('b')).to.equal(2);
      expect(apiCalls()).to.deep.equal([GET(1)]);
      expect(output).not.to.contain('WARNING');
    });

    it('warns on other API errors but still submits', () => {
      editState((s) => (s.status = 500));
      const output = submit();
      expect(prOf('b')).to.equal(2);
      expect(output).to.contain('WARNING: Could not link the GitHub stack');
      expect(output).to.contain('HTTP 500');
    });

    it('respects --no-gh-stack, the repo setting, and --gh-stack', () => {
      submit(`--no-gh-stack`);
      expect(prOf('b')).to.equal(2);
      expect(apiCalls()).to.deep.equal([]);

      const configPath = path.join(scene.dir, '.git/.graphite_repo_config');
      fs.writeJsonSync(configPath, {
        ...fs.readJsonSync(configPath),
        githubStacks: false,
      });
      expect(
        scene.repo.runCliCommandAndGetOutput([`config`, `--no-interactive`])
      ).to.contain('repo github-stacks: disabled');
      submit();
      expect(apiCalls()).to.deep.equal([]);

      submit(`--gh-stack`);
      expect(apiCalls()).to.deep.equal([GET(1), CREATE([1, 2])]);
    });

    it('links the longest chain of a tree and warns about the rest', () => {
      // a → b, and a → c → d
      scene.repo.checkoutBranch('a');
      createBranches(['c', 'd']);
      scene.repo.checkoutBranch('a');
      const output = submit(`--stack`);
      const [a, c, d] = ['a', 'c', 'd'].map(prOf);
      expect(apiCalls()).to.deep.equal([GET(a), CREATE([a, c, d])]);
      expect(output).to.contain('linked a → c → d and left out b');
    });

    it('`ch unstack` dissolves the stack and reports PRs GitHub kept', () => {
      submit();
      editState((s) => (s.queued = [1]));
      fs.rmSync(logPath, { force: true });
      const output = scene.repo.runCliCommandAndGetOutput([`unstack`, `-f`]);
      expect(apiCalls()).to.deep.equal([
        GET(2),
        'api repos/owner/name/stacks/100/unstack --method POST',
      ]);
      expect(output).to.contain('GitHub kept #1 stacked');
      expect(scene.repo.runCliCommandAndGetOutput([`ls`])).not.to.contain(
        'stack #'
      );

      editState((s) => (s.queued = []));
      scene.repo.checkoutBranch('a');
      expect(
        scene.repo.runCliCommandAndGetOutput([`unstack`, `--no-interactive`])
      ).to.contain('Dissolved GitHub stack #100');
    });
  });
}
