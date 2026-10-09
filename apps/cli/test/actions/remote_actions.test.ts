import { expect, use } from 'chai';
import { getBranchesFromRemote } from '../../src/actions/sync/get';
import { syncAction } from '../../src/actions/sync/sync';
import { readMetadataRef } from '../../src/lib/engine/metadata_ref';
import { composeGit } from '../../src/lib/git/git';
import { initContext, initContextLite } from '../../src/lib/context';
import { CloneScene } from '../lib/scenes/clone_scene';
import { configureTest } from '../lib/utils/configure_test';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

// CloneScene.getContext() loads the origin repo; this one loads the clone.
const cloneContext = () =>
  initContext(
    initContextLite({ interactive: false, quiet: true }),
    composeGit(),
    {
      verify: false,
    }
  );

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe('handle remote actions properly (sync/submit)', function () {
    configureTest(this, scene);

    it('can push a branch to remote', async () => {
      scene.repo.createChange('1');
      scene.repo.runCliCommand([`create`, `1`, `-am`, `1`]);
      expect(scene.repo.currentBranchName()).to.equal('1');

      composeGit().pushBranch({
        remote: 'origin',
        branchName: '1',
        noVerify: false,
        forcePush: false,
      });

      expect(scene.repo.getRef('refs/heads/1')).to.equal(
        scene.originRepo.getRef('refs/heads/1')
      );
    });

    it('fails to push to a branch with external commits', () => {
      scene.repo.createChange('1');
      scene.repo.runCliCommand([`create`, `1`, `-am`, `1`]);
      expect(scene.repo.currentBranchName()).to.equal('1');

      scene.originRepo.createChange('2');
      scene.originRepo.runCliCommand([`create`, `1`, `-am`, `1`]);
      expect(scene.originRepo.getRef('refs/heads/1')).to.not.equal(
        scene.repo.getRef('refs/heads/1')
      );

      expect(() =>
        composeGit().pushBranch({
          remote: 'origin',
          branchName: '1',
          noVerify: false,
          forcePush: false,
        })
      ).to.throw();
    });

    it('refuses to push a frozen branch', () => {
      scene.repo.createChange('1');
      scene.repo.runCliCommand([`create`, `1`, `-am`, `1`]);
      scene.repo.runCliCommand([`freeze`]);

      expect(() => cloneContext().engine.pushBranch('1', false)).to.throw(
        /frozen/
      );
      expect(scene.originRepo.getRef('refs/heads/1')).to.equal('');
    });

    it('can pull trunk from remote', async () => {
      scene.originRepo.createChangeAndCommit('a');

      await syncAction(
        {
          pull: true,
          force: false,
          delete: false,
          showDeleteProgress: false,
          restack: false,
        },
        scene.getContext()
      );

      expect(scene.repo.getRef('refs/heads/main')).to.equal(
        scene.originRepo.getRef('refs/heads/main')
      );
    });

    it('errors if trunk diverges from remote and force is false', async () => {
      scene.originRepo.createChangeAndCommit('a');
      scene.repo.createChangeAndCommit('b');
      await expect(
        syncAction(
          {
            pull: true,
            force: false,
            delete: false,
            showDeleteProgress: false,
            restack: false,
          },
          scene.getContext()
        )
      ).to.eventually.be.rejectedWith(/could not be fast-forwarded[\s\S]*--force/);
    });

    it('can reset trunk from remote', async () => {
      scene.originRepo.createChangeAndCommit('a');
      scene.repo.createChangeAndCommit('b');

      await syncAction(
        {
          pull: true,
          force: true,
          delete: false,
          showDeleteProgress: false,
          restack: false,
        },
        scene.getContext()
      );

      expect(scene.repo.getRef('refs/heads/main')).to.equal(
        scene.originRepo.getRef('refs/heads/main')
      );
    });

    it('get freezes fetched branches unless asked not to', async () => {
      for (const b of ['t', 'u']) {
        scene.originRepo.createAndCheckoutBranch(b);
        scene.originRepo.createChangeAndCommit(b, b);
      }
      scene.originRepo.checkoutBranch('main');

      await getBranchesFromRemote(
        {
          branches: [{ branch: 't', parent: 'main' }],
          force: false,
          freezeNew: () => true,
        },
        cloneContext()
      );
      await getBranchesFromRemote(
        {
          branches: [{ branch: 'u', parent: 't' }],
          force: false,
          freezeNew: () => false,
        },
        cloneContext()
      );
      expect(readMetadataRef('t', scene.dir).frozen).to.equal(true);
      expect(readMetadataRef('u', scene.dir).frozen).to.equal(undefined);
    });

    it('get overwrites a frozen branch that diverged from remote', async () => {
      scene.originRepo.createAndCheckoutBranch('t');
      scene.originRepo.createChangeAndCommit('t', 't');
      await getBranchesFromRemote(
        {
          branches: [{ branch: 't', parent: 'main' }],
          force: false,
          freezeNew: () => true,
        },
        cloneContext()
      );

      scene.originRepo.createChangeAndCommit('t2', 't');
      scene.repo.checkoutBranch('t');
      scene.repo.createChangeAndCommit('local', 'local');
      scene.repo.checkoutBranch('main');

      await getBranchesFromRemote(
        {
          branches: [{ branch: 't', parent: 'main' }],
          force: false,
          freezeNew: () => true,
        },
        cloneContext()
      );
      expect(scene.repo.getRef('refs/heads/t')).to.equal(
        scene.originRepo.getRef('refs/heads/t')
      );
      expect(readMetadataRef('t', scene.dir).frozen).to.equal(true);
    });

    it('get errors clearly when a branch cannot be traced to trunk', () => {
      // The test harness has no GitHub PRs, so PR-based stack resolution fails
      // gracefully (rather than silently no-op'ing like the old stub).
      expect(() => scene.repo.runCliCommand([`get`, `nonexistent`])).to.throw();
    });
  });
}
