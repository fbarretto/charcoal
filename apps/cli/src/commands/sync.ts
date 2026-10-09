export { builder, handler } from './repo-commands/repo_sync';
export const command = 'sync';
export const canonical = 'sync';
export const description =
  'Pull the trunk branch from remote, prompt to delete any branches whose PRs have been merged or closed, and restack every branch that can be restacked without conflicts. If trunk cannot be fast-forwarded to match remote, overwrites trunk with the remote version.';
