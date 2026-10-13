import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { inferPRBody } from '../../src/actions/submit/pr_body';
import { getPRTitle } from '../../src/actions/submit/pr_title';
import { createPrBodyFooter } from '../../src/actions/create_pr_body_footer';
import { TContext } from '../../src/lib/context';
import { updatePrBodyFooter } from '../../src/actions/submit/submit_action';
import { validateNoEmptyBranches } from '../../src/actions/submit/validate_branches';
import { BasicScene } from '../lib/scenes/basic_scene';
import { configureTest } from '../lib/utils/configure_test';

use(chaiAsPromised);

for (const scene of [new BasicScene()]) {
  describe(`(${scene}): correctly infers submit info from commits`, function () {
    configureTest(this, scene);

    it('can infer title/body from single commit', async () => {
      const title = 'Test Title';
      const body = ['Test body line 1.', 'Test body line 2.'].join('\n');
      const message = `${title}\n\n${body}`;

      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, message]);

      expect(
        await getPRTitle(
          { branchName: 'a', editPRFieldsInline: false },
          scene.getContext()
        )
      ).to.equals(title);
      expect(
        inferPRBody(
          { branchName: 'a', template: 'template' },
          scene.getContext()
        ).inferredBody
      ).to.equals(`template`);

      scene
        .getContext()
        .userConfig.update((data) => (data.submitIncludeCommitMessages = true));

      expect(
        await getPRTitle(
          { branchName: 'a', editPRFieldsInline: false },
          scene.getContext()
        )
      ).to.equals(title);
      expect(
        inferPRBody(
          { branchName: 'a', template: 'template' },
          scene.getContext()
        ).inferredBody
      ).to.equals(`${body}\n\ntemplate`);
    });

    it('can infer just title with no body', async () => {
      const title = 'Test Title';
      const commitMessage = title;

      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, commitMessage]);

      expect(
        await getPRTitle(
          { branchName: 'a', editPRFieldsInline: false },
          scene.getContext()
        )
      ).to.equals(title);
      expect(
        inferPRBody(
          { branchName: 'a', template: 'template' },
          scene.getContext()
        ).inferredBody
      ).to.equal('template');
    });

    it('can infer title/body from multiple commits', async () => {
      const title = 'Test Title';
      const secondSubj = 'Second commit subject';

      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, title]);
      scene.repo.createChangeAndCommit(secondSubj);

      expect(
        await getPRTitle(
          { branchName: 'a', editPRFieldsInline: false },
          scene.getContext()
        )
      ).to.equals(title);
      expect(
        inferPRBody({ branchName: 'a' }, scene.getContext()).inferredBody
      ).to.equal(``);

      scene
        .getContext()
        .userConfig.update((data) => (data.submitIncludeCommitMessages = true));

      expect(
        await getPRTitle(
          { branchName: 'a', editPRFieldsInline: false },
          scene.getContext()
        )
      ).to.equals(title);
      expect(
        inferPRBody({ branchName: 'a' }, scene.getContext()).inferredBody
      ).to.equal(`${title}\n\n${secondSubj}`);
    });

    it('aborts if the branch is empty', async () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      await expect(validateNoEmptyBranches(['a'], scene.getContext())).to.be
        .rejected;
    });

    it('does not abort if the branch is not empty', async () => {
      scene.repo.createChange('a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      await expect(validateNoEmptyBranches(['a'], scene.getContext())).to.be
        .fulfilled;
    });
  });
}

describe('updatePrBodyFooter', () => {
  const newFooter =
    '\n\n<!-- charcoal-stack -->\n#### Stack · 1 of 1\n\n◉ **#83** 👈\\\n`main` (base)\n<!-- /charcoal-stack -->';
  const footerCount = (s: string) =>
    (s.match(/<!-- charcoal-stack -->/g) ?? []).length;
  const description = `Some PR description

**Changes In This Pull Request:**`;

  it('returns the footer when there is no body', () => {
    expect(updatePrBodyFooter(undefined, newFooter)).to.equal(newFooter);
  });

  it('appends the footer when the body has none', () => {
    expect(updatePrBodyFooter(description, newFooter)).to.equal(
      description + newFooter
    );
  });

  it('replaces an existing footer rather than appending a second', () => {
    const existing = description + newFooter;
    expect(updatePrBodyFooter(existing, newFooter)).to.equal(existing);
  });

  it('does not duplicate the footer when content was appended after it', () => {
    // e.g. an external bot appended a section after Charcoal's footer (#118)
    const existing = `${description}${newFooter}\n\n---\n_posted by a bot_`;
    const result = updatePrBodyFooter(existing, newFooter);
    expect(footerCount(result)).to.equal(1);
    expect(result).to.contain('_posted by a bot_');
    expect(result.endsWith(newFooter)).to.equal(true);
  });

  it('replaces the old indented dependency tree', () => {
    const legacy =
      '\n\n\n#### PR Dependency Tree\n\n\n* **PR #82**\n  * **PR #83** 👈\n\nThis tree was auto-generated by [Charcoal](https://github.com/danerwilliams/charcoal)';
    expect(updatePrBodyFooter(description + legacy, newFooter)).to.equal(
      description + newFooter
    );
  });

  it('collapses an already-duplicated footer to a single one', () => {
    const existing = `${description}${newFooter}${newFooter}`;
    expect(updatePrBodyFooter(existing, newFooter)).to.equal(
      description + newFooter
    );
  });
});

describe('createPrBodyFooter', () => {
  // develop <- a <- b <- c <- e, plus d off b; e has no PR yet.
  const parents: Record<string, string> = {
    a: 'develop',
    b: 'a',
    c: 'b',
    d: 'b',
    e: 'c',
  };
  const numbers: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 };
  const context = {
    engine: {
      trunk: 'develop',
      isTrunk: (b: string) => b === 'develop',
      getParent: (b: string) => parents[b],
      getChildren: (b: string) =>
        Object.keys(parents).filter((c) => parents[c] === b),
      getPrInfo: (b: string) =>
        numbers[b] ? { number: numbers[b] } : undefined,
    },
  } as unknown as TContext;
  const block = (branch: string, details = {}) =>
    createPrBodyFooter(context, branch, details).split('\n');

  it('lists one line top to bottom, current marked, base at the bottom', () => {
    expect(block('b').slice(3, 8)).to.deep.equal([
      '| | Stack · 2 of 3 | Status | Threads |',
      '|:-:|---|---|---|',
      '| ◯ | #3 |  |  |',
      '| ◉ | **#2** 👈 |  |  |',
      '| ◯ | #1 |  |  |',
    ]);
    expect(block('b')[8]).to.equal('| ◯ | `develop` (base) | | |');
  });

  it('picks one Graphite-style status per PR', () => {
    const status = (d: object) => block('b', { 2: d })[6].split(' | ')[2];
    expect(status({ state: 'MERGED', isDraft: true })).to.equal('🟣 Merged');
    expect(status({ state: 'OPEN', isDraft: true })).to.equal('📝 Draft');
    expect(status({ state: 'OPEN', mergeable: 'CONFLICTING' })).to.equal(
      '⚠️ Merge conflicts'
    );
    expect(
      status({ state: 'OPEN', checks: 'FAILURE', reviewDecision: 'APPROVED' })
    ).to.equal('❌ CI failing');
    expect(
      status({ state: 'OPEN', checks: 'PENDING', reviewDecision: 'APPROVED' })
    ).to.equal('⏳ CI running');
    expect(
      status({ state: 'OPEN', checks: 'SUCCESS', reviewDecision: 'APPROVED' })
    ).to.equal('✅ Ready to merge');
    expect(status({ state: 'OPEN', checks: 'SUCCESS' })).to.equal(
      '👀 Needs review'
    );
  });

  it('shows titles and states in aligned columns', () => {
    const lines = block('b', {
      3: {
        title: 'Add *x*',
        state: 'OPEN',
        checks: 'FAILURE',
        threads: { resolved: 1, total: 2 },
      },
      2: { title: 'Fix y', state: 'MERGED', checks: 'FAILURE' },
    });
    expect(lines[5]).to.equal(
      '| ◯ | #3 Add \\*x\\* | ❌ CI failing | 💬 1/2 |'
    );
    expect(lines[6]).to.equal('| ◉ | **#2 Fix y** 👈 | 🟣 Merged |  |');
  });

  it('adds a copyable list of the stack', () => {
    const lines = block('b', { 3: { title: 'Add *x*' } });
    const start = lines.indexOf('```');
    expect(lines.slice(start, start + 5)).to.deep.equal([
      '```',
      '#3 Add *x*',
      '#2',
      '#1',
      '```',
    ]);
  });
});
