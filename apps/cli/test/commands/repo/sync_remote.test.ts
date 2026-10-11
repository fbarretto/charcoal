import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { cuteString } from '../../../src/lib/utils/cute_string';
import {
  readMetadataRef,
  writeMetadataRef,
} from '../../../src/lib/engine/metadata_ref';
import { CloneScene } from '../../lib/scenes/clone_scene';
import { configureTest } from '../../lib/utils/configure_test';
import { expectCommits } from '../../lib/utils/expect_commits';

for (const scene of [new CloneScene()]) {
  // eslint-disable-next-line max-lines-per-function
  describe(`(${scene}): sync pulls remote changes into tracked branches`, function () {
    configureTest(this, scene);

    // No GitHub in tests: skip fetching PR info.
    beforeEach(() =>
      fs.writeFileSync(
        `${scene.dir}/.git/.graphite_repo_config`,
        cuteString({ trunk: 'main', isGithubIntegrationEnabled: false })
      )
    );

    const create = (branch: string) => {
      scene.repo.createChange(branch, branch);
      scene.repo.runCliCommand([`create`, branch, `-m`, branch]);
    };
    const push = (branch: string) =>
      scene.repo.runGitCommand([`push`, `-f`, `origin`, branch]);
    // Someone else pushes `message` on top of `branch`.
    const remoteCommit = (branch: string, message: string) => {
      scene.originRepo.checkoutBranch(branch);
      scene.originRepo.createChangeAndCommit(message, message);
      scene.originRepo.checkoutBranch('main');
    };
    const localCommit = (branch: string, message: string) => {
      scene.repo.checkoutBranch(branch);
      scene.repo.createChangeAndCommit(message, message);
    };
    const local = (branch: string) => scene.repo.getRef(`refs/heads/${branch}`);
    const remote = (branch: string) =>
      scene.originRepo.getRef(`refs/heads/${branch}`);
    const sync = (...flags: string[]) =>
      scene.repo.runCliCommandAndGetOutput([`sync`, `--no-delete`, ...flags]);

    it('fast-forwards a branch that only has new remote commits', () => {
      create('a');
      push('a');
      remoteCommit('a', 'a2');
      scene.repo.checkoutBranch('main');
      writeMetadataRef(
        'a',
        { ...readMetadataRef('a', scene.dir), prInfo: { number: 7 } },
        scene.dir
      );

      expect(sync()).to.contain('Synced a from remote.');
      expect(local('a')).to.equal(remote('a'));
      expect(readMetadataRef('a', scene.dir).parentBranchName).to.equal('main');
      expect(readMetadataRef('a', scene.dir).prInfo?.number).to.equal(7);
      expect(scene.repo.currentBranchName()).to.equal('main');
    });

    it('leaves branches without remote changes untouched', () => {
      create('a');
      push('a');
      localCommit('a', 'unpushed');
      create('b'); // never pushed
      const [aBefore, bBefore] = [local('a'), local('b')];

      sync();

      expect(local('a')).to.equal(aBefore);
      expect(local('b')).to.equal(bBefore);
    });

    it('keeps local commits on a diverged branch when not interactive', () => {
      create('a');
      push('a');
      remoteCommit('a', 'theirs');
      localCommit('a', 'mine');
      const before = local('a');

      expect(sync()).to.match(/a has diverged from remote[\s\S]*--force/);
      expect(local('a')).to.equal(before);
      expectCommits(scene.repo, 'mine, a, 1');
    });

    it('overwrites a diverged branch with --force', () => {
      create('a');
      push('a');
      remoteCommit('a', 'theirs');
      localCommit('a', 'mine');

      sync('--force');

      expect(local('a')).to.equal(remote('a'));
    });

    it('keeps a local restack when the remote has nothing new', () => {
      create('a');
      create('b');
      create('c');
      ['a', 'b', 'c'].forEach(push);
      scene.repo.runCliCommand([`delete`, `b`, `-f`]);
      const before = local('c');

      expect(sync()).not.to.contain('Synced c from remote.');

      expect(local('c')).to.equal(before);
      expect(
        scene.repo.runGitCommandAndGetOutput([`ls-tree`, `--name-only`, `c`])
      ).not.to.contain('b_test.txt');
    });

    it('takes a remote rebase when every local commit is on remote', () => {
      create('a');
      push('a');
      // Someone restacks `a` onto a newer trunk and force-pushes.
      scene.originRepo.createChangeAndCommit('m2', 'm2');
      scene.originRepo.runGitCommand([`checkout`, `a`]);
      scene.originRepo.runGitCommand([`rebase`, `main`]);
      scene.originRepo.checkoutBranch('main');

      sync();

      expect(local('a')).to.equal(remote('a'));
      expect(local('main')).to.equal(remote('main'));
    });

    it('takes the remote version of a diverged frozen branch', () => {
      create('a');
      push('a');
      scene.repo.runCliCommand([`freeze`, `a`]);
      remoteCommit('a', 'theirs');
      localCommit('a', 'stale');

      sync();

      expect(local('a')).to.equal(remote('a'));
      expect(readMetadataRef('a', scene.dir).frozen).to.equal(true);
    });

    it('pulls a stack and restacks the local branches above it', () => {
      create('a');
      create('b');
      push('a');
      push('b');
      create('c'); // local only
      remoteCommit('a', 'a2');
      scene.repo.checkoutBranch('main');

      sync();

      expect(local('a')).to.equal(remote('a'));
      // b had no remote changes; it and c are restacked onto the new a.
      scene.repo.checkoutBranch('c');
      expectCommits(scene.repo, 'c, b, a2, a, 1');
      expect(readMetadataRef('b', scene.dir).parentBranchRevision).to.equal(
        local('a')
      );
    });

    it('skips a branch checked out in another worktree', () => {
      create('a');
      push('a');
      remoteCommit('a', 'a2');
      scene.repo.checkoutBranch('main');
      const before = local('a');
      const worktree = fs.realpathSync(path.join(tmp.dirSync().name)) + '/wt';
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'a']);

      try {
        expect(sync()).to.contain(
          `Skipped a: it is checked out in another worktree (${worktree})`
        );
        expect(local('a')).to.equal(before);
      } finally {
        scene.repo.runGitCommand(['worktree', 'remove', '--force', worktree]);
      }
    });

    const withTrunkInWorktree = (fn: (worktree: string) => void) => {
      create('a');
      scene.originRepo.createChangeAndCommit('m2', 'm2');
      const worktree = fs.realpathSync(path.join(tmp.dirSync().name)) + '/wt';
      scene.repo.runGitCommand(['worktree', 'add', worktree, 'main']);
      try {
        fn(worktree);
      } finally {
        scene.repo.runGitCommand(['worktree', 'remove', '--force', worktree]);
      }
    };

    it('fast-forwards trunk checked out in a clean worktree, then restacks', () =>
      withTrunkInWorktree(() => {
        sync();
        expect(local('main')).to.equal(remote('main'));
        expectCommits(scene.repo, 'a, m2');
      }));

    it('skips pulling trunk checked out in a dirty worktree and still syncs', () =>
      withTrunkInWorktree((worktree) => {
        const mainBefore = local('main');
        fs.writeFileSync(path.join(worktree, '1_test.txt'), 'dirty');

        expect(sync()).to.contain(
          `Skipped pulling main: it is checked out in another worktree (${worktree})`
        );
        expect(local('main')).to.equal(mainBefore);
        expect(
          fs.readFileSync(path.join(worktree, '1_test.txt'), 'utf-8')
        ).to.equal('dirty');
      }));

    it('does not pull branches with --no-pull', () => {
      create('a');
      push('a');
      remoteCommit('a', 'a2');
      const before = local('a');

      sync('--no-pull');

      expect(local('a')).to.equal(before);
    });
  });
}
