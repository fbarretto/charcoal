import { expect } from 'chai';
import prompts from 'prompts';
import {
  splitCurrentBranch,
  suggestSplitBranchName,
} from '../../../src/actions/split';
import { allScenes } from '../../lib/scenes/all_scenes';
import { configureTest } from '../../lib/utils/configure_test';
import { expectBranches } from '../../lib/utils/expect_branches';

for (const scene of allScenes) {
  describe(`(${scene}): split`, function () {
    configureTest(this, scene);

    it('Offers splitting by file in the strategy prompt', async () => {
      scene.repo.createChange('x', 'x');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a1`]);
      scene.repo.createChangeAndCommit('y', 'y');

      prompts.inject(['file', 'x_test.txt', 'xsplit']);
      await splitCurrentBranch({ style: undefined }, scene.getContext(true));

      expectBranches(scene.repo, 'a, main, xsplit');
      expect(scene.repo.runCliCommandAndGetOutput([`parent`])).to.equal(
        'xsplit'
      );
    });

    it('Suggests branch names from commit messages, like create', () => {
      scene.repo.runCliCommand([`user`, `branch-date`, `--disable`]);
      scene.repo.createChange('a', 'a');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`]);
      const context = scene.getContext();
      const suggest = (subject: string | undefined, branchNames: string[]) =>
        suggestSplitBranchName(
          { branchToSplit: 'a', branchNames, subject },
          context
        );

      expect(suggest('Add login form', [])).to.equal('Add_login_form');
      expect(suggest('Add login form', ['Add_login_form'])).to.equal('a');
      expect(suggest('main', [])).to.equal('a');
      expect(suggest(undefined, ['a'])).to.equal('a_split');
    });

    it('Can commit without running hooks (used by split --by-hunk)', () => {
      scene.repo.createPrecommitHook('exit 1');
      scene.repo.runCliCommand([`create`, `a`, `-m`, `a`, `--no-verify`]);
      scene.repo.createChange('b', 'b');
      const context = scene.getContext();
      context.engine.commit({ message: 'b', noVerify: true });
      expect(
        scene.repo.runGitCommandAndGetOutput([`log`, `-1`, `--format=%s`])
      ).to.equal('b');
    });
  });
}
