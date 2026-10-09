import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';

// A fake `gh` on PATH, backed by a JSON state file. It emulates the PR
// subcommands Charcoal uses plus GitHub's stacks API, and logs every call.
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
const prs = () => Object.values(st.prs);
const find = (id) => prs().find((p) => String(p.number) === id || p.headRefName === id);
const view = (p) => ({
  state: 'OPEN', title: 't', body: '', reviewDecision: '', isDraft: false,
  author: { login: 'me' }, reviewRequests: [], reviews: [],
  ...p, url: url(p.number),
});

if (args[0] === '--version') { console.log('gh version 2.80.0'); process.exit(0); }
if (args[0] === 'auth') process.exit(0);
fs.appendFileSync(logPath, args.join(' ') + '\\n');
if (args[0] === 'pr' && args[1] === 'view') {
  const pr = find(args[2]);
  if (!pr) fail('no pull requests found for branch "' + args[2] + '"');
  if (!args.includes('--web')) out(view(pr));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'list') {
  out(prs().filter((p) => p.baseRefName === flag('--base') && (p.state ?? 'OPEN') === 'OPEN').map(view));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  const n = st.nextPr++;
  st.prs[flag('--head')] = { number: n, headRefName: flag('--head'), baseRefName: flag('--base') };
  save();
  console.log(url(n));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'edit' && args.includes('--base')) {
  find(args[2]).baseRefName = flag('--base');
  save();
}
if (args[0] === 'pr') process.exit(0);
if (args[0] === 'api' && args[1] === 'user') { out({ login: st.user ?? 'me' }); process.exit(0); }
if (args[0] === 'api' && args[1].includes('/stacks?pull_request=')) {
  if (!st.stacks) fail('gh: Not Found (HTTP 404)');
  const n = Number(args[1].split('=')[1]);
  out(st.stacks.filter((s) => s.prs.includes(n)).map((s) => ({
    number: s.number,
    base: { ref: 'main' },
    pull_requests: s.prs.map((number) => ({ number, head: { ref: prs().find((p) => p.number === number).headRefName } })),
  })));
  process.exit(0);
}
if (args[0] === 'api') fail('gh: Not Found (HTTP 404)');
fail('fake gh: unexpected ' + args.join(' '));
`;

export type TFakePr = {
  number: number;
  headRefName: string;
  baseRefName: string;
  state?: string;
  isDraft?: boolean;
  author?: { login: string };
  reviewRequests?: { login: string }[];
  reviews?: { author: { login: string } }[];
};

export type TFakeGhState = {
  prs: Record<string, TFakePr>;
  nextPr: number;
  user?: string;
  stacks?: { number: number; prs: number[] }[];
};

export class FakeGh {
  private dir = '';
  private originalPath: string | undefined;

  install(state: Partial<TFakeGhState> = {}): void {
    this.dir = tmp.dirSync().name;
    fs.writeFileSync(
      path.join(this.dir, 'gh'),
      `#!${process.execPath}\n${FAKE_GH}`,
      { mode: 0o755 }
    );
    this.write({ prs: {}, nextPr: 1, ...state });
    this.originalPath = process.env.PATH;
    process.env.PATH = `${this.dir}${path.delimiter}${process.env.PATH}`;
    process.env.FAKE_GH_STATE = path.join(this.dir, 'state.json');
    process.env.FAKE_GH_LOG = path.join(this.dir, 'gh.log');
  }

  uninstall(): void {
    process.env.PATH = this.originalPath;
  }

  read(): TFakeGhState {
    return JSON.parse(
      fs.readFileSync(path.join(this.dir, 'state.json'), 'utf-8')
    );
  }

  write(state: TFakeGhState): void {
    fs.writeFileSync(path.join(this.dir, 'state.json'), JSON.stringify(state));
  }

  edit(f: (s: TFakeGhState) => void): void {
    const s = this.read();
    f(s);
    this.write(s);
  }

  // Every logged call, minus the read-only `pr view` lookups unless asked.
  calls(opts: { views?: boolean } = {}): string[] {
    const log = path.join(this.dir, 'gh.log');
    return (
      fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n') : []
    )
      .filter(Boolean)
      .filter((c) => opts.views || !/^pr view \S+ .*--json/.test(c));
  }

  clearCalls(): void {
    fs.rmSync(path.join(this.dir, 'gh.log'), { force: true });
  }
}
