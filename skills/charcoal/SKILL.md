---
name: charcoal
description: Manage stacked pull requests with Charcoal (`ch`), the open-source Graphite-compatible CLI. Use when creating, navigating, amending, restacking, reordering, submitting, syncing or merging a stack of dependent branches/PRs, when a repo uses `ch` or Graphite-style (`gt`) workflows, or when a `ch` restack or sync hits a conflict.
allowed-tools:
  - "Bash(ch *)"
  - "Bash(git status *)"
  - "Bash(git diff *)"
  - "Bash(git log *)"
  - "Bash(git show *)"
  - "Bash(git add *)"
  - "Bash(git restore *)"
  - "Bash(git reset *)"
  - "Bash(git reflog *)"
  - "Bash(git branch *)"
  - "Bash(git rev-parse *)"
  - "Bash(gh pr view *)"
  - "Bash(gh pr checks *)"
  - "Bash(gh pr edit *)"
---

# Charcoal (`ch`)

`ch` keeps a chain of branches (a **stack**) rebased on each other and submits one PR per branch. Commands, flags and defaults match Graphite's `gt`, in the flat form (`ch create`, not `gt branch create`). Full reference: [`DOCUMENTATION.md`](https://github.com/fbarretto/charcoal/blob/main/DOCUMENTATION.md).

Words: **trunk** is the base branch (`main`). **Downstack** = toward trunk (parents). **Upstack** = away from trunk (children). **Restack** = rebase each branch onto its parent.

## One-time setup

```bash
ch auth                 # once per machine; delegates to the GitHub CLI (gh)
ch init --trunk main    # once per repo
```

## Quick reference

| I want to…                                     | Command                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| See the stack                                  | `ch ls` (`ch log` for detail)                                        |
| Start a new layer from staged changes          | `ch create <name> -m "msg"` (`-a` stages everything first)           |
| Amend the current layer                        | `ch modify -a` (no editor; `-m` to reword, `-c -m` for a new commit) |
| Amend a layer below me without checking it out | `git add <files> && ch modify --into <branch>`                       |
| Let each hunk find its own layer               | `ch absorb -a -d` (preview), then `ch absorb -a`                     |
| Move up / down / top / bottom                  | `ch up`, `ch down`, `ch top`, `ch bottom`                            |
| Jump to a branch                               | `ch co <branch>`                                                     |
| Rebase everything onto its parent              | `ch restack`                                                         |
| Re-parent a branch and its children            | `ch move --onto <branch>`                                            |
| Move one branch, leave its children behind     | `ch move --only --source <b> --onto <target>`                        |
| Put an existing branch under `ch`              | `ch track -p <parent>`                                               |
| Split files out into a new layer below         | `ch split --by-file <pathspec>`                                      |
| Merge a layer into its parent                  | `ch fold` (`--stack` folds the whole stack into one)                 |
| Rename / delete                                | `ch rename <new>` / `ch delete <b> -f`                               |
| Diff of just this layer                        | `ch info -d` or `git diff "$(ch parent)"...HEAD`                     |
| Push and open/update PRs                       | `ch submit --stack`                                                  |
| Pull trunk, drop merged branches, restack      | `ch sync`                                                            |
| Merge the stack bottom-up                      | `ch merge --dry-run`, then `ch merge`                                |
| Undo the last `ch` command                     | `ch undo`                                                            |
| Finish / cancel a conflicted command           | `ch continue` / `ch abort -f`                                        |

## Running `ch` as an agent

`ch` turns prompts off when stdin or stdout isn't a terminal, which is the case for an agent's shell. `--no-interactive` and `-q` force it. A prompt that can't be asked either takes a safe default or fails with a message, so **pass the flag that answers it up front**:

| Situation                                                       | Without the flag                             | Pass                                                             |
| --------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `create` with neither name nor `-m`                             | fails                                        | a name and `-m`                                                  |
| `create -m` with nothing staged                                 | makes an **empty** branch, warns `-m` unused | `git add` first, or `-a` / `-u`                                  |
| `modify` with nothing staged                                    | fails ("Cannot run without staged changes")  | `git add` first, or `-a` / `-u`                                  |
| `create -i` when the parent has several children                | moves all of them                            | (choose with `ch move` afterwards)                               |
| `delete` with no name                                           | fails                                        | the branch name                                                  |
| `delete` of an unmerged branch (or `--upstack` / `--downstack`) | fails                                        | `-f`                                                             |
| `track` when several parents are possible                       | fails                                        | `-p <parent>`, or `-f` (nearest ancestor each time)              |
| `untrack` of a branch with children                             | fails, hints `--force`                       | `-f`                                                             |
| `up` / `top` at a fork                                          | fails, lists the children                    | `ch up --to <b>` or `ch co <b>`                                  |
| `co`, `move` with no target                                     | fails                                        | `ch co <b>`, `ch move --onto <b>`                                |
| `split` without `--by-file`                                     | fails (by-commit / by-hunk need a terminal)  | `--by-file <pathspec>`                                           |
| `reorder`                                                       | opens an editor                              | don't; use `ch move` per branch                                  |
| `rename` with no name                                           | fails                                        | the name (`-f` if it has an open PR; renaming drops the PR link) |
| `abort`                                                         | fails, hints `--force`                       | `-f`                                                             |
| `undo`, `absorb`, `unstack`                                     | proceed without confirming                   | `absorb -d` first to preview                                     |
| `submit` with open PRs above the current branch                 | submits only trunk → current                 | `--stack`                                                        |
| `submit` creating new PRs                                       | creates them as **drafts**                   | `--publish` for ready-for-review                                 |
| `submit` PR title and body                                      | not prompted; taken from the commits         | set them with `gh pr edit` afterwards                            |
| `submit` while local trunk differs from remote                  | fails ("Aborting non-interactive submit")    | `ch sync` first, or `--ignore-out-of-sync-trunk`                 |
| `submit` with an empty or already-merged branch in range        | fails                                        | delete it, or `ch sync`                                          |
| `sync` when trunk can't fast-forward                            | fails, hints `--force`                       | `-f` (resets local trunk to remote)                              |
| `sync` finding merged/closed branches                           | keeps them, naming each one                  | `-d` (delete all) or `-f`                                        |
| `merge` when a local branch differs from its remote             | refuses                                      | `ch submit` first                                                |
| `get` when a local branch diverged from remote                  | aborts                                       | `-f` (take remote)                                               |

## What makes a good PR

- **Stands alone.** Each layer builds and passes CI on top of its parent alone, and is safe to deploy if the layers above never land.
- **One idea.** One module, or one mechanical change across many. A refactor and the feature that needs it are two layers.
- **Small.** Reviewers read a 150-line layer; they skim a 1,500-line one. More, smaller PRs beat fewer, bigger ones, as long as each still builds.

**Branch names:** `<stack-topic>/<what-this-layer-does>`, kebab-case, e.g. `upload-retry/extract-backoff`, `upload-retry/retry-on-503`. Always pass the name: without one, `ch` derives it from the message and, by default, prefixes the date (`10-09-Add_retry`).

## Creating a stack

```bash
git add src/backoff.ts
ch create upload-retry/extract-backoff -m "Extract backoff helper"
git add src/upload.ts
ch create upload-retry/retry-on-503 -m "Retry uploads on 503"
ch ls
```

Each `create` stacks on the current branch. `--onto <branch>` stacks somewhere else; `-i` inserts the new branch between the current branch and its children.

### Untracked branch (fresh worktree, branch made with `git`)

`ch` refuses to work on a branch it doesn't track (`Cannot perform this operation on untracked branch`). Check with `ch info`, then:

```bash
ch track -p main     # this branch becomes the bottom layer
ch create ...        # keep stacking
```

`ch track -f` tracks a whole chain of untracked branches, picking the nearest ancestor as each parent.

## Navigating

`ch up [n]`, `ch down [n]`, `ch top`, `ch bottom`, `ch co <branch>`, `ch co -t` (trunk). `ch parent` and `ch children` print names for scripting.

## Changing the stack

**Amend mid-stack.** Either check the layer out, change it, and `ch modify -a` (everything above is restacked), or stay where you are and send staged changes down:

```bash
git add src/backoff.ts
ch modify --into upload-retry/extract-backoff   # never checks it out; restacks above it
```

`--into` fails without changing anything if the staged diff doesn't apply cleanly to the target. `ch absorb -a` does the routing per hunk (needs `git-absorb` on PATH); preview with `-d`. You stay on your branch.

**Re-parent / reorder.** `ch move --onto <target>` moves the current branch and everything above it. `--only` moves just one branch, and its children close the gap. To change which branch a single branch sits on without rebasing anything yet, `ch track -p <parent>` then `ch restack`.

**Split and fold.** `ch split --by-file 'docs/**'` moves matching files into a new branch below the current one, which keeps its PR. `ch fold` merges the current branch into its parent; `ch fold --stack` collapses the whole stack. To re-cut a layer by hand: `git reset HEAD^` (changes stay unstaged), re-stage pieces, `ch create` each.

**Others' branches.** `ch freeze <b>` (that branch and everything below it) makes `ch` refuse to rewrite or push them; `restack` and `submit` skip them, and you can still stack on top. `ch get <b or PR#>` pulls a teammate's stack and freezes branches authored by others. `ch unfreeze <b>` reverses it.

**Diffs and sizes of a layer are against its parent**, never trunk, except for the bottom layer:

```bash
git diff "$(ch parent)"...HEAD --stat    # three dots
ch info -d -s                            # same, via ch
```

**Worktrees.** `ch` never rewrites a branch checked out in another worktree: restacks skip it with a message, and `ch ls` shows the path. Run the command in that worktree to update it. `undo`, `continue` and `abort` only see commands run from the current worktree.

## Before submitting

1. `ch ls`: the bottom branch must sit directly on trunk. If not: `ch co <bottom>`, `ch move --onto main`.
2. Nothing says `(needs restack)`; if something does, run `ch restack`.
3. Run the project's lint/build/test on every layer, not just the top, and fix failures in the layer that caused them (`ch modify --into`, or check it out), not in a new layer on top:

   ```bash
   ch test '<validate>'    # runs it on every branch of the stack, returns to where you were
   ```

   It exits non-zero if any branch failed; read the `[failed]` lines (each points at an output file under the printed directory). `--upstack` / `--downstack` limit the scope.

## Submitting

```bash
ch submit --stack --dry-run    # what would be pushed
ch submit --stack              # new PRs open as drafts; add --publish for ready-for-review
```

`submit` force-pushes with lease and creates or updates one PR per branch. It also **links the PRs as a native GitHub stack** (and relinks it when the stack changes shape), so you don't need the `gh stack` extension, and must not run `gh stack` commands on branches `ch` manages: the two would fight over the same stack. `--no-gh-stack` skips the linking for one submit; `ch unstack -f` dissolves an existing GitHub stack.

Then give each PR a real title and body. **Write the body to a file and pass `--body-file`**; never pipe markdown through a shell heredoc, which mangles backticks, `$` and tables.

```bash
gh pr edit <number-or-branch> --title "Retry uploads on 503" --body-file /tmp/pr-body.md
```

Say what the stack is for, what this layer changes, and why it's split here. `gh pr view <b> --json number,url` finds the PR for a branch.

## Conflicts and recovery

When a restack hits a conflict, `ch` stops mid-rebase and prints the unmerged files.

1. Edit the files until no `<<<<<<<` markers remain.
2. `git add <files>`
3. `ch continue` (or `ch continue -a` to stage everything).

**Use `ch continue`, never `git rebase --continue`.** Git alone finishes the one branch and drops the rest of `ch`'s queued work; the branches above are left `(needs restack)`. If that already happened, run `ch restack`.

**While a conflict is pending, finish it before doing anything else.** `ch` refuses every command that could change state ("This command is blocked while a rebase is in progress") except `ch continue` and `ch abort`; read-only ones like `ch ls` and `ch info` still work.

`ch abort -f` gives up: it aborts the rebase and restores every branch to how it was before the command. If that command was a `create` or `modify`, what it committed comes back as staged changes.

**After a context reset**, `git status` showing "rebase in progress" means a `ch` command is halted. Read the unmerged files: if they're already resolved, `git add` and `ch continue`; if not, resolve first. `ch continue` reports "Rebase conflict is not yet resolved" until every file is staged.

`sync` never stops on a conflict: it restacks what it can and lists the rest ("All branches restacked cleanly, except for: …"). Check each out and `ch restack`.

**Undo.** `ch undo` reverts the last `ch` command in this worktree (up to 10 back): branches, metadata, checked-out branch. It's local only, so it can't undo `submit`, `merge`, `unstack` or `--close`. It refuses mid-rebase or with uncommitted tracked changes. Undoing a `create` or `modify` hands the committed changes back as staged changes, so commit or discard them before undoing further.

## Deleting branches

```bash
ch delete <branch> -f              # children are restacked onto its parent
ch delete <branch> -f --upstack    # and everything above it
ch delete <branch> -f --downstack  # and everything below it, down to trunk
ch delete <branch> -f -c           # also close its open PR
```

`ch sync -d` deletes every branch whose PR is merged or closed.

## Merging

`ch merge --dry-run` lists the PRs from trunk up to the current branch; `ch merge` merges them bottom-up: a GitHub stack in one async merge request, unstacked PRs one at a time, retargeting and re-pushing each next PR as it goes. It stops at the first PR GitHub won't merge. Run `ch sync` afterwards to clean up the merged branches.

## Troubleshooting

| Symptom                                                      | Fix                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `Cannot perform this operation on untracked branch`          | `ch track -p <parent>`                                        |
| Bottom branch isn't on trunk                                 | `ch co <bottom> && ch move --onto main`                       |
| `(needs restack)` in `ch ls`                                 | `ch restack`                                                  |
| `Cannot perform this operation without a branch checked out` | `ch co <branch>` (HEAD is detached)                           |
| `This command is blocked while a rebase is in progress`      | `ch continue` or `ch abort -f` first                          |
| `<branch> is frozen`                                         | It isn't yours; stack on it. If it is: `ch unfreeze <branch>` |
| `There are tracked changes that have not been committed`     | Commit (`ch modify`) or stash, then retry                     |
| `submit`: trunk out of sync                                  | `ch sync`, then submit                                        |
| `sync`: `main could not be fast-forwarded`                   | `ch sync -f` (local trunk commits are discarded)              |
| `merge`: `GitHub stack #N ... does not match this stack`     | `ch submit --stack` to relink, then `ch merge`                |
| `Skipped <b>: it is checked out in another worktree`         | Run the command in that worktree                              |
