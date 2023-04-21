import { runGitCommand } from './runner';
import { getMergeBase } from './merge_base';
import { getCommitRange } from './commit_range';
import { getSha } from './get_sha';

export function isMerged({
  branchName,
  trunkName,
}: {
  branchName: string;
  trunkName: string;
}): boolean {
  const mergeBase = getMergeBase(branchName, trunkName);
  const branchCommits = getCommitRange(trunkName, branchName, 'SHA').reverse();

  // note - we copied this code from the server
  const lastMergedCommitSha = branchCommits.reduce(
    (currentBase, nextCommit) => {
      // Create a commit of all changes between currentBase and nextCommit
      const testCommit = runGitCommand({
        args: [
          `commit-tree`,
          `${nextCommit}^{tree}`,
          `-p`,
          currentBase,
          `-m`,
          `_`,
        ],
        onError: 'ignore',
        resource: 'mergeBaseCommitTree',
      });

      // Does a commit with these changes exist in trunk?
      const isMerged = runGitCommand({
        args: [`cherry`, trunkName, testCommit, currentBase],
        onError: 'ignore',
        resource: 'isMerged',
      }).startsWith('-');

      // If so, move the base forward to nextCommit
      return isMerged ? nextCommit : currentBase;
    },
    mergeBase
  );

  return lastMergedCommitSha === getSha(branchName);
}
