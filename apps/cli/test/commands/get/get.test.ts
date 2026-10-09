import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import prompts from 'prompts';
import { getBranchesFromRemote } from '../../../src/actions/sync/get';
import { initContext, initContextLite } from '../../../src/lib/context';
import { readMetadataRef } from '../../../src/lib/engine/metadata_ref';
import { composeGit } from '../../../src/lib/git/git';
import { CloneScene } from '../../lib/scenes/clone_scene';
import { configureTest } from '../../lib/utils/configure_test';
import { FakeGh } from '../../lib/utils/fake_gh';

use(chaiAsPromised);

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): get`, function () {
    configureTest(this, scene);
    const gh = new FakeGh();

    // Remote stack main <- a (mine) <- b <- c (a teammate's).
    beforeEach(() => {
      ['a', 'b', 'c'].forEach((b) => {
        scene.originRepo.createAndCheckoutBranch(b);
        scene.originRepo.createChangeAndCommit(b, b);
      });
      scene.originRepo.checkoutBranch('main');
      gh.install({
        prs: {
          a: { number: 1, headRefName: 'a', baseRefName: 'main' },
          b: {
            number: 2,
            headRefName: 'b',
            baseRefName: 'a',
            author: { login: 'teammate' },
          },
          c: {
            number: 3,
            headRefName: 'c',
            baseRefName: 'b',
            author: { login: 'teammate' },
          },
        },
        nextPr: 4,
      });
      scene.repo.runCliCommand([`repo`, `owner`, `--set`, `owner`]);
      scene.repo.runCliCommand([`repo`, `name`, `--set`, `name`]);
    });
    afterEach(() => gh.uninstall());

    const get = (...args: string[]) =>
      scene.repo.runCliCommand([`get`, `--no-interactive`, ...args]);
    const frozen = (b: string) => !!readMetadataRef(b, scene.dir).frozen;
    const exists = (b: string) => scene.repo.getRef(`refs/heads/${b}`) !== '';
    const advanceOrigin = (b: string) => {
      scene.originRepo.checkoutBranch(b);
      scene.originRepo.createChangeAndCommit(`${b}2`, `${b}2`);
      scene.originRepo.checkoutBranch('main');
    };
    const matchesOrigin = (b: string) =>
      scene.repo.getRef(`refs/heads/${b}`) ===
      scene.originRepo.getRef(`refs/heads/${b}`);

    it('gets the downstack, freezing only branches authored by others', () => {
      get(`b`);
      expect(scene.repo.currentBranchName()).to.equal('b');
      expect(exists('c')).to.be.false;
      expect(frozen('a')).to.be.false;
      expect(frozen('b')).to.be.true;
    });

    it('-U leaves every new branch unfrozen', () => {
      get(`b`, `-U`);
      expect(frozen('b')).to.be.false;
    });

    it('--no-checkout stays on the current branch', () => {
      get(`b`, `--no-checkout`);
      expect(scene.repo.currentBranchName()).to.equal('main');
      expect(exists('b')).to.be.true;
    });

    it('-u gets remote-only upstack PRs by walking PR bases', () => {
      get(`a`, `-u`);
      expect(exists('c')).to.be.true;
      expect(gh.calls()).to.include(
        'pr list --repo owner/name --base a --state open --json headRefName'
      );
    });

    it('-u uses the GitHub stack when the PR is in one', () => {
      gh.edit((s) => (s.stacks = [{ number: 100, prs: [1, 2, 3] }]));
      get(`a`, `-u`);
      expect(exists('c')).to.be.true;
      expect(gh.calls().some((c) => c.startsWith('pr list'))).to.be.false;
    });

    it('syncs local upstack branches unless --downstack', () => {
      get(`c`);
      advanceOrigin('c');
      get(`b`, `--downstack`);
      expect(matchesOrigin('c')).to.be.false;
      get(`b`);
      expect(matchesOrigin('c')).to.be.true;
    });

    it('with no branch, syncs the whole current stack', () => {
      get(`c`);
      advanceOrigin('c');
      scene.repo.checkoutBranch('b');
      get();
      expect(matchesOrigin('c')).to.be.true;
      expect(scene.repo.currentBranchName()).to.equal('b');
    });

    it('restacks local branches on top unless --no-restack', () => {
      get(`b`);
      scene.repo.createChange('d', 'd');
      scene.repo.runCliCommand([`create`, `d`, `-m`, `d`]);
      advanceOrigin('b');

      get(`b`, `--no-restack`);
      const parentRev = () =>
        scene.repo.runGitCommandAndGetOutput([`rev-parse`, `d~`]);
      expect(parentRev()).to.not.equal(scene.repo.getRef('refs/heads/b'));
      get(`b`);
      expect(parentRev()).to.equal(scene.repo.getRef('refs/heads/b'));
    });

    it('--delete-all deletes merged branches of the stack without asking', () => {
      get(`b`);
      gh.edit((s) => {
        s.prs.a.state = 'MERGED';
        s.prs.b.baseRefName = 'main';
      });
      get(`b`, `--delete-all`);
      expect(exists('a')).to.be.false;
      expect(readMetadataRef('b', scene.dir).parentBranchName).to.equal('main');
    });

    it('offers to cancel when rebasing onto remote conflicts', async () => {
      get(`a`, `-U`);
      scene.repo.checkoutBranch('a');
      scene.repo.createChangeAndCommit('local', 'a2');
      advanceOrigin('a');
      scene.repo.checkoutBranch('main');
      const before = scene.repo.getRef('refs/heads/a');

      prompts.inject(['REBASE', 'cancel']);
      const context = initContext(
        initContextLite({ interactive: true, quiet: true }),
        composeGit(),
        { verify: false }
      );
      await expect(
        getBranchesFromRemote(
          {
            branches: [{ branch: 'a', parent: 'main' }],
            force: false,
            freezeNew: () => false,
          },
          context
        )
      ).to.be.rejectedWith(/Killed/);
      expect(scene.repo.rebaseInProgress()).to.be.false;
      expect(scene.repo.getRef('refs/heads/a')).to.equal(before);
    });
  });
}
