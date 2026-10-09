import { expect } from 'chai';
import fs from 'fs-extra';
import prompts from 'prompts';
import { createBranchAction } from '../../../src/actions/create_branch';
import { withEditor, withTTY } from '../../lib/utils/interactive';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';
import { removeUnsupportedTrailingCharacters } from '../../../src/lib/utils/branch_name';

for (const scene of allScenes) {
  describe(`(${scene}): branch create`, function () {
    configureTest(this, scene);

    it('Can run branch create', () => {
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.createChangeAndCommit('2', '2');

      scene.repo.runCliCommand(['down']);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Can rollback changes on a failed commit hook', () => {
      // Aggressive AF commit hook from your angry coworker
      scene.repo.createPrecommitHook('exit 1');
      scene.repo.createChange('2');
      expect(() => {
        scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      }).to.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Can create a branch without providing a name', () => {
      scene.repo.createChange('2');
      scene.repo.runCliCommand([`create`, `-m`, `feat(test): info.`]);
      expect(scene.repo.currentBranchName().includes('feat_test_info')).to.be
        .true;
      expectCommits(scene.repo, 'feat(test): info.');
    });

    it('Can create a branch with add all option', () => {
      scene.repo.createChange('23', 'test', true);
      scene.repo.runCliCommand([
        `create`,
        `test-branch`,
        `-m`,
        `add all`,
        `-a`,
      ]);
    });

    it('Can restack its parents children', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);

      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.runCliCommand(['down']);

      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `--insert`]);
      expect(() => scene.repo.runCliCommand(['up'])).not.to.throw();

      expectCommits(scene.repo, 'b, c, a');
    });

    it('Can create onto another branch, carrying staged changes', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);

      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `--onto`, `a`]);
      expect(scene.repo.currentBranchName()).to.equal('c');
      expectCommits(scene.repo, 'c, a, 1');

      scene.repo.runCliCommand(['down']);
      expect(scene.repo.currentBranchName()).to.equal('a');
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Refuses to create onto a branch when carrying changes would conflict', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');

      scene.repo.createChange('main-version', 'a');
      expect(() =>
        scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `-o`, `a`])
      ).to.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('a_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([`branch`, `--list`, `c`])
      ).to.equal('');
    });

    it('Refuses to create onto an untracked branch', () => {
      scene.repo.createAndCheckoutBranch('untracked');
      scene.repo.checkoutBranch('main');
      expect(() =>
        scene.repo.runCliCommand([`create`, `c`, `--onto`, `untracked`])
      ).to.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Can insert onto another branch', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('main');

      scene.repo.createChange('c', 'c');
      scene.repo.runCliCommand([`create`, `c`, `-m`, `c`, `-o`, `a`, `-i`]);
      scene.repo.checkoutBranch('b');
      expectCommits(scene.repo, 'b, c, a');
    });

    it('Stages updates to tracked files, but not untracked ones, with -u', () => {
      scene.repo.createChangeAndCommit('1', 'tracked');
      scene.repo.createChange('2', 'tracked', true);
      scene.repo.createChange('new', 'untracked', true);
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`, `-u`]);
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `show`,
          `--name-only`,
          `--format=`,
        ])
      ).to.equal('tracked_test.txt');
      expect(
        scene.repo.runGitCommandAndGetOutput([`ls-files`, `--others`])
      ).to.equal('untracked_test.txt');
    });

    it('Joins repeated -m as paragraphs and names the branch from the first', () => {
      scene.repo.createChange('2');
      scene.repo.runCliCommand([`create`, `-m`, `title`, `-m`, `body`]);
      expect(scene.repo.currentBranchName()).to.match(/title$/);
      expect(
        scene.repo.runGitCommandAndGetOutput([`log`, `-1`, `--format=%B`])
      ).to.equal('title\n\nbody');
    });

    it('Opens the editor and names the branch from the message when given neither', () => {
      scene.repo.createChange('2');
      withEditor('from editor', () => scene.repo.runCliCommand([`create`]));
      expect(scene.repo.currentBranchName()).to.match(/from_editor$/);
      expectCommits(scene.repo, 'from editor, 1');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('main');
    });

    it('Shows the diff in the commit template with -v', () => {
      scene.repo.createChange('verbose-content');
      const template = `${scene.dir}/../template-${Date.now()}`;
      withEditor(
        'v',
        () => scene.repo.runCliCommand([`create`, `-v`]),
        template
      );
      expect(fs.readFileSync(template, 'utf-8')).to.contain('+verbose-content');
    });

    it('Deduplicates a branch name derived in the editor', () => {
      scene.repo.createChange('2', '2');
      withEditor('same', () => scene.repo.runCliCommand([`create`]));
      const first = scene.repo.currentBranchName();
      scene.repo.createChange('3', '3');
      withEditor('same', () => scene.repo.runCliCommand([`create`]));
      expect(scene.repo.currentBranchName()).to.equal(`${first}_2`);
    });

    it('Still requires a name or message with --no-interactive', () => {
      scene.repo.createChange('2');
      expect(() =>
        scene.repo.runCliCommand([`create`, `--no-interactive`])
      ).to.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('Allows passing the current branch to --onto', () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`, `--onto`, `a`]);
      expectCommits(scene.repo, 'b, a, 1');
    });

    it('Keeps what a failing pre-commit hook wrote', () => {
      scene.repo.createPrecommitHook('echo hooked > hook.txt\nexit 1');
      scene.repo.createChange('2');
      expect(() =>
        scene.repo.runCliCommand([`create`, `a`, `-m`, `a`])
      ).to.throw(Error);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(fs.readFileSync(`${scene.dir}/hook.txt`, 'utf-8')).to.equal(
        'hooked\n'
      );
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `diff`,
          `--cached`,
          `--name-only`,
        ])
      ).to.equal('test.txt');
    });

    it('Asks whether to stage unstaged changes', async () => {
      scene.repo.createChangeAndCommit('1', 'tracked');
      scene.repo.createChange('2', 'tracked', true);
      scene.repo.createChange('new', 'untracked', true);
      prompts.inject(['update']);
      await withTTY(() =>
        createBranchAction(
          { branchName: 'a', message: 'a' },
          scene.getContext(true)
        )
      );
      expect(
        scene.repo.runGitCommandAndGetOutput([
          `show`,
          `--name-only`,
          `--format=`,
        ])
      ).to.equal('tracked_test.txt');
    });

    it('Asks for a name when creating an empty branch without one', async () => {
      prompts.inject(['empty']);
      await withTTY(() => createBranchAction({}, scene.getContext(true)));
      expect(scene.repo.currentBranchName()).to.equal('empty');
    });

    it('Asks which children --insert moves when there are several', async () => {
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      scene.repo.checkoutBranch('main');
      scene.repo.createChange('b', 'b');
      scene.repo.runCliCommand([`create`, `b`, `-m`, `b`]);
      scene.repo.checkoutBranch('main');

      scene.repo.createChange('c', 'c');
      prompts.inject([['b']]);
      await withTTY(() =>
        createBranchAction(
          { branchName: 'c', message: 'c', insert: true },
          scene.getContext(true)
        )
      );
      expect(scene.repo.runCliCommandAndGetOutput([`children`])).to.equal('b');
      scene.repo.checkoutBranch('a');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal('main');
    });
  });
}

describe('removeUnsupportedTrailingCharacters', () => {
  [
    {
      name: 'No unsupported trailing characters',
      input: 'Hello world',
      expected: 'Hello world',
    },
    {
      name: 'Trailing dot',
      input: 'Hello world.',
      expected: 'Hello world',
    },
    {
      name: 'Trailing slash',
      input: 'Hello world/',
      expected: 'Hello world',
    },
    {
      name: 'Multiple unsupported trailing characters',
      input: 'Hello world/_./.',
      expected: 'Hello world/_',
    },
  ].forEach((tc) => {
    it(tc.name, () => {
      const strippedInput = removeUnsupportedTrailingCharacters(tc.input);
      expect(strippedInput).equals(tc.expected);
    });
  });
});
