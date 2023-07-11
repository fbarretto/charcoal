import type { Logger } from "@withgraphite/gti-shared";
import type { RepositoryReference } from "@withgraphite/gti-server/src/RepositoryCache";

import { repositoryCache } from "@withgraphite/gti-server/src/RepositoryCache";
import * as vscode from "vscode";
import { getCLICommand } from "./config";

/**
 * Construct Repositories and VSCodeRepos for every workspace folder.
 * Treats repositoryCache as the source of truth for re-using repositories.
 */
export function watchAndCreateRepositoriesForWorkspaceFolders(
  logger: Logger
): vscode.Disposable {
  const knownRepos = new Map<string, RepositoryReference>();
  function updateRepos(
    added: ReadonlyArray<vscode.WorkspaceFolder>,
    removed: ReadonlyArray<vscode.WorkspaceFolder>
  ) {
    for (const add of added) {
      const { fsPath } = add.uri;
      if (knownRepos.has(fsPath)) {
        throw new Error(
          `Attempted to add workspace folder path twice: ${fsPath}`
        );
      }
      const repoReference = repositoryCache.getOrCreate(
        getCLICommand(),
        logger,
        fsPath
      );
      knownRepos.set(fsPath, repoReference);
    }
    for (const remove of removed) {
      const { fsPath } = remove.uri;
      const repo = knownRepos.get(fsPath);
      repo?.unref();
      knownRepos.delete(fsPath);
    }
  }
  if (vscode.workspace.workspaceFolders) {
    updateRepos(vscode.workspace.workspaceFolders, []);
  }
  return vscode.workspace.onDidChangeWorkspaceFolders((e) => {
    updateRepos(e.added, e.removed);
  });
  // TODO: consider also listening for vscode.workspace.onDidOpenTextDocument to support repos
  // for ad-hoc non-workspace-folder files
}

export const __TEST__ = { watchAndCreateRepositoriesForWorkspaceFolders };
