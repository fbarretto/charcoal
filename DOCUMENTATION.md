# Charcoal command reference

Charcoal is an open-source fork of the Graphite CLI for working with stacked branches and pull requests on GitHub. The command is `ch`.

> **Migrating from Graphite?** Charcoal is a *flat* CLI: top-level verbs like `ch create`, `ch submit`, and `ch sync` replace the old noun-verb forms (`gt branch create`, `gt stack submit`, …). If you have muscle memory for `gt`, add `alias gt=ch` to your shell profile. The binary is also installed as `charcoal` if you prefer the long name.

---

## Concepts

- **Stack** — a chain of dependent branches, each based on the one below it. Charcoal tracks the parent/child relationships so it can keep the whole chain rebased and submitted together.
- **Trunk** — your repo's base branch (e.g. `main`). Every stack starts from trunk.
- **Downstack** — the branches *below* the current one, toward trunk (its ancestors).
- **Upstack** — the branches *above* the current one, away from trunk (its descendants).

When a command "restacks", it rebases each affected branch onto its parent so the stack stays consistent.

---

## Global options

Every command accepts these:

| Flag | Description |
| --- | --- |
| `--interactive` / `--no-interactive` | Prompt the user. On by default when stdin and stdout are terminals, off otherwise (pipes, scripts, CI); pass either flag to override. |
| `-q`, `--quiet` | Minimize output to the terminal. Implies `--no-interactive`. |
| `--cwd <dir>` | Run as if Charcoal was started in `<dir>`. |
| `--verify` / `--no-verify` | Run git hooks. On by default; `--no-verify` skips them. |
| `--debug` | Display debug output. |
| `--help` | Show help for any command. `ch --help --all` also lists hidden options. |
| `--version` | Show the installed version. |

**Environment overrides** (apply to a single invocation):

- `CH_EDITOR` (or `GT_EDITOR`) — override the editor Charcoal opens.
- `CH_PAGER` (or `GT_PAGER`) — override the pager Charcoal opens.

---

## Create & modify

### `create` (alias `c`)
Create a new branch stacked on top of the current branch and commit staged changes. If no branch name is given, it is generated from the commit message; with neither a name nor `-m`, the commit editor opens and the name comes from the message you write there (a taken name gets a `_2`, `_3`, … suffix). With nothing staged and no name, it asks for a name and creates an empty branch.

If nothing is staged but there are unstaged changes, and no staging flag is passed, it asks whether to stage them: everything (`--all`), tracked files only (`--update`), selected hunks (`--patch`), or nothing.

| Flag | Description |
| --- | --- |
| `[name]` | Positional: name for the new branch. |
| `-m`, `--message` | Commit staged changes on the new branch with this message. Repeat it to add paragraphs, as with `git commit`; the branch name comes from the first line. |
| `-a`, `--all` | Stage all unstaged changes before committing, including untracked files. |
| `-u`, `--update` | Stage all updates to tracked files before committing. |
| `-p`, `--patch` | Pick hunks to stage before committing. |
| `-v`, `--verbose` | Show the diff at the bottom of the commit message template; twice (`-vv`) also shows the unstaged changes. |
| `-i`, `--insert` | Existing children of the parent branch become children of the new branch. With several children, asks which ones to move (all are moved with `--no-interactive`). |
| `-o`, `--onto` | Stack the new branch on this branch instead of the current one (the current branch itself is allowed). Uncommitted changes are carried over; if that would overwrite them, nothing is changed. With `--insert`, the children of the `--onto` branch move onto the new branch. |

If a pre-commit hook fails, the new branch is removed and you're back where you started, with the staged changes and anything the hook wrote still in the working tree.

```
ch create -am "Add login form"
ch create                       # write the message in the editor; the name follows
ch create fix -m "Fix typo" --onto main
```

### `modify` (alias `m`)
Modify the current branch by amending its commit (or creating a new one with `--commit`) and restack upstack branches. **Amends by default, without opening an editor** (pass `-e` to edit the message). A branch with no commits always gets a new commit. If nothing is staged but there are unstaged changes, and no staging flag is passed, it asks whether to stage them (see `create`).

| Flag | Description |
| --- | --- |
| `-a`, `--all` | Stage all changes, including untracked files, before committing. |
| `-u`, `--update` | Stage all updates to tracked files before committing. |
| `-p`, `--patch` | Pick hunks to stage before committing. |
| `-c`, `--commit` | Create a new commit instead of amending the current one. |
| `-m`, `--message` | The message for the new or amended commit; no editor opens. Repeat it to add paragraphs. |
| `-e`, `--edit` | Open an editor to edit the message when amending. `-n`, `--no-edit` (Charcoal-only) turns it off and takes precedence. |
| `-v`, `--verbose` | Show the diff in the commit message template; `-vv` also shows unstaged changes. |
| `--reset-author` | Set the author of the commit to the current user when amending. |
| `--interactive-rebase` | Ignore all other flags and start a git interactive rebase on the branch's commits, then restack (same as `ch edit`). |
| `--into <branch>` | Commit the staged changes into a branch downstack of the current one instead. |

With `--into`, the target must be downstack of the current branch (not trunk) and not checked out in another worktree. It is never checked out: the new commit is built from the target's tree plus the staged diff, and the command fails without changing anything if that diff doesn't apply cleanly. It amends the target's last commit (keeping its message unless `-m` is given) or, with `-c`, adds a new commit (which requires `-m`). `--reset-author` makes the current user the author of the amended commit. Then everything upstack of the target is restacked and you stay on the current branch. Unstaged changes are kept. If a restack conflict interrupts the command, the uncommitted changes are saved in a stash commit whose sha is printed (`git stash apply <sha>` after `ch continue`). `--into` naming the current branch is a plain `modify`.

```
ch modify -a            # amend current commit with all changes
ch modify -c -m "Fix"   # add a new commit instead
ch modify --into parent-branch   # amend staged changes into a downstack branch
```

### `absorb` (alias `ab`)
Amend each staged hunk into the commit in the current downstack (trunk → current branch) that last touched those lines, then restack. Requires [git-absorb](https://github.com/tummychow/git-absorb) on `PATH` (`brew install git-absorb`).

| Flag | Description |
| --- | --- |
| `-a`, `--all` | Stage all changes to tracked files before absorbing. Untracked files are left out, since a new file is never absorbed. |
| `-d`, `--dry-run` | Print which commit each hunk would go into, and change nothing. |
| `-f`, `--force` | Don't ask for confirmation. Without it, the plan is printed and confirmed first (interactive mode only). |
| `-p`, `--patch` | Pick hunks to stage before absorbing. |

`git absorb` creates `fixup!` commits scoped to the downstack, which are then squashed in by one autosquash rebase; every downstack branch is moved to its rewritten commit, and everything upstack of the bottom branch is restacked. You stay on the current branch. Hunks git-absorb can't place (new or deleted files, lines no commit in the stack owns) stay uncommitted, as unstaged changes, and their count is printed. With nothing staged and no staging flag, it asks whether to stage your unstaged changes (tracked files only). git-absorb's hunk placement is its own heuristic, so an edge-case hunk can land differently than with `gt absorb`. Downstack branches must already be restacked, and the stack must not already contain `fixup!`/`squash!`/`amend!` commits. `ch undo` reverts it.

```
ch absorb -a      # absorb every change, after confirming
ch absorb -d      # preview
```

### `squash` (alias `sq`)
Squash all commits in the current branch into one and restack upstack branches. Does nothing if the branch has at most one commit. If restacking an upstack branch conflicts, that branch is left needing a restack (shown in `ch ls`; fix it with `ch restack`) instead of stopping for conflict resolution.

| Flag | Description |
| --- | --- |
| `-m`, `--message` | The updated message for the commit. Repeat it to add paragraphs. |
| `--edit` / `-n`, `--no-edit` | Whether to modify the existing commit message (`--no-edit` takes precedence). |

```
ch squash -m "Implement feature"
```

### `edit` (alias `e`)
Run an interactive rebase on the current branch's commits and restack upstack branches. Charcoal-only shorthand for `ch modify --interactive-rebase` (gt dropped its `edit` command for that flag).

```
ch edit
```

### `split` (alias `sp`)
Split the current branch into multiple branches. With no flag, a branch with one commit goes straight to `--by-hunk`; otherwise it asks for a strategy (by commit, by hunk, or by file, which then asks for the pathspecs). New branch names are suggested from their commit messages, as `ch create` would name them (for `--by-commit`, the oldest commit of each new branch). Git hooks don't run on the commits split creates.

| Flag | Description |
| --- | --- |
| `-c`, `--by-commit`, `--commit` | Split by commit — slice up the branch's history. |
| `-h`, `--by-hunk`, `--hunk` | Split by hunk into new single-commit branches. |
| `-f`, `--by-file <pathspec>` | Move the changes to files matching the pathspec into a new branch inserted **below** the current one. Repeatable. |

`--by-file` doesn't need interactive mode: the new parent branch is named via a prompt (default `<branch>_split`), or automatically with `--no-interactive`. It gets one commit holding the matched files' final contents. The current branch keeps its commits minus those files (commits left empty are dropped), ends at the same tree it started with, and keeps its PR. Children are restacked. Refuses if no changes match, or if every change matches (nothing would remain).

```
ch split --by-commit
ch split --by-file 'docs/**' -f README.md
```

### `fold` (alias `f`)
Fold a branch's changes into its parent, update descendants' dependencies, and restack. Nothing happens on GitHub unless you pass `--close`.

| Flag | Description |
| --- | --- |
| `-k`, `--keep` | Keep the current branch's name instead of the parent's name. |
| `-c`, `--close` | Close the open pull requests of the branches folded away (via `gh pr close`). |
| `--stack` | Fold the whole stack — from the bottom branch through the top (`ch top`'s pick; it asks at a fork) — into one branch: the bottom one, or the current one with `--keep`. Every branch in it must already be restacked. Branches hanging off the stack become children of the retained branch and are restacked. |

```
ch fold
ch fold --stack -c
```

### `rename` (alias `rn`)
Rename a branch and update metadata referencing it. If no name is supplied, you'll be prompted. **This removes any associated GitHub pull request.**

| Flag | Description |
| --- | --- |
| `[name]` | Positional: the new branch name. |
| `-f`, `--force` | Allow renaming a branch already associated with an open PR. |

```
ch rename better-name
```

### `delete` (alias `dl`)
Delete a branch and its corresponding Charcoal metadata. Children of deleted branches are restacked onto the nearest surviving ancestor. With no branch name, opens an interactive selector (in non-interactive mode, a name is required). If a branch to delete is neither merged nor closed, Charcoal asks for confirmation (in non-interactive mode it refuses unless `--force` is passed). When more than one branch would be deleted, Charcoal lists them and asks once.

| Flag | Description |
| --- | --- |
| `[name]` | Positional: branch to delete. If omitted, opens an interactive selector. |
| `-f`, `--force` | Delete even if a branch is not merged or closed, without confirmation. |
| `--upstack` | Also delete every branch above it. |
| `--downstack` | Also delete every branch below it, down to (not including) trunk. |
| `-c`, `--close` | Close the open GitHub PRs of the deleted branches. Not reverted by `ch undo`. |

```
ch delete old-branch -f
ch delete                          # pick a branch interactively
ch delete my-branch --upstack      # my-branch and everything above it
```

### `pop`
Delete the current branch but retain the state of files in the working tree.

```
ch pop
```

### `revert`
**Experimental.** Create a new branch off trunk that reverts a commit already on trunk, track it with trunk as its parent, and check it out. Refuses commits that aren't on trunk; if the revert doesn't apply cleanly, nothing is changed. Requires a clean working tree.

| Flag | Description |
| --- | --- |
| `<sha>` | Positional: the trunk commit to revert. |
| `-e`, `--edit` | Edit the revert's commit message. |

```
ch revert 1a2b3c4
```

---

## Navigate

### `checkout` (alias `co`)
Switch to a branch. With no argument, opens an interactive selector.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to switch to. |
| `-u`, `--show-untracked` | Include untracked branches in the interactive selector. |
| `-s`, `--stack` | Only show ancestors and descendants of the current branch in the interactive selector. |
| `-t`, `--trunk` | Check out the trunk. |

```
ch co            # interactive
ch co -s         # interactive, current stack only
ch co my-branch
ch co -t
```

### `up` (alias `u`)
Switch to the child of the current branch. Prompts if ambiguous. Exits non-zero if the current branch has no children.

| Flag | Description |
| --- | --- |
| `[steps]` / `-n`, `--steps` | Number of levels to traverse upstack (default 1). |
| `--to` | Target branch. When multiple children exist, follow the path leading to this branch instead of prompting. Must be upstack of the current branch. |

```
ch up 2
ch up --to feature-c
```

### `down` (alias `d`)
Switch to the parent of the current branch. Exits non-zero on trunk.

| Flag | Description |
| --- | --- |
| `[steps]` / `-n`, `--steps` | Number of levels to traverse downstack (default 1). |

```
ch down
```

### `top` (alias `t`)
Switch to the tip branch of the current stack. Prompts if ambiguous.

```
ch top
```

### `bottom` (alias `b`)
Switch to the first branch from trunk in the current stack.

```
ch bottom
```

---

## Stack operations

### `restack` (alias `r`)
Ensure each branch in the current stack is based on its parent, rebasing if necessary. Use scope flags to limit which branches are restacked.

| Flag | Description |
| --- | --- |
| `--comment <msg>` | Add a comment with `<msg>` to every submitted PR. |
| `-m`, `--merge-when-ready` | Enable auto-merge (`gh pr merge --auto --squash`) on every submitted PR. |
| `--rerequest-review` | Re-request review from the current reviewers of every updated PR. |
| `-v`, `--view` | Open the PR in the browser after submitting. |
| `--restack` | Restack the branches before submitting. Branches that would conflict are left unrestacked and listed (the submit then stops on them). |
| `--ignore-out-of-sync-trunk` | Submit even if trunk differs from its remote. Otherwise submit warns, then asks (or, with `--no-interactive`, fails). |
| `--cli` | Accepted for gt compatibility; Charcoal always edits PR metadata in the CLI. |
| `--branch` | Submit as if `<branch>` were checked out (default: current branch). |
| `-d`, `--downstack` | Only restack this branch and its ancestors. |
| `-u`, `--upstack` | Only restack this branch and its descendants. |
| `-o`, `--only` | Only restack this branch. |

```
ch restack
ch restack --upstack
```

### `move` (alias `mv`)
Rebase the current branch onto the latest commit of a target branch and restack all of its descendants. With no argument, opens an interactive selector.

| Flag | Description |
| --- | --- |
| `[branch]`, `-o`, `--onto` | The target branch to rebase onto. |
| `-s`, `--source` | Branch to rebase (defaults to current branch). |
| `--only` | Move only the source branch. Its children stay where they were, re-parented onto the source's old parent and restacked without the source's commits. |

```
ch move main
ch move --only --source b --onto main
```

### `reorder` (alias `ro`)
Reorder the branches between trunk and the current branch, restacking all descendants. Opens an interactive editor listing one branch per line, with trunk shown at the bottom for orientation.

| Flag | Description |
| --- | --- |
| `--stack` | Also include every upstack branch through the tip that `ch top` would select. Prompts if ambiguous. |

```
ch reorder
ch reorder --stack
```

### `track` (alias `tr`)
Start tracking the current (or provided) branch with Charcoal by selecting its parent. Also used to fix corrupted Charcoal metadata (an already-tracked branch is re-tracked).

The parent prompt lists every branch in the branch's git history (tracked or not, nearest first), each with the number of commits that would go into the tracked branch. If the chosen parent is itself untracked, Charcoal tracks it next, repeating until it reaches a tracked branch or trunk, so running `ch track` from the tip of an untracked chain tracks the whole chain. In non-interactive mode, a choice between several parents fails unless `--parent` or `--force` is given.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to track. |
| `-p`, `--parent` | The tracked branch's parent. Tracks only this one branch. |
| `-f`, `--force` | Pick the nearest ancestor of each branch as its parent, without prompting. Takes precedence over `--parent`. |

```
ch track -p main
ch track -f      # track an untracked chain, nearest ancestor each time
```

### `untrack` (aliases `utr`, `ut`)
Stop tracking a branch with Charcoal. If it has children, they are also untracked. Defaults to the current branch.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to untrack. |
| `-f`, `--force` | Don't prompt before untracking a branch with children. |

```
ch untrack feature-x
```

### `test`
Run a command on each branch in the current stack and aggregate the results. Use scope flags to limit which branches run.

| Flag | Description |
| --- | --- |
| `<command>` | Positional: the command to run on each branch. |
| `-d`, `--downstack` | Run from trunk to the current branch. |
| `-u`, `--upstack` | Run on the current branch and its descendants. |
| `-t`, `--trunk` | Also run on the trunk branch. |

```
ch test "npm test"
ch test --upstack "npm run lint"
```

### `continue` (alias `cont`)
Continue the most recent Charcoal command halted by a merge conflict (e.g. during a restack or sync).

| Flag | Description |
| --- | --- |
| `-a`, `--all` | Stage all changes before continuing. |

```
ch continue -a
```

### `undo`
Undo the most recent Charcoal mutation (e.g. `create`, `modify`, `restack`, `delete`, `sync`) by restoring every local branch, its Charcoal metadata, and the previously checked-out branch. Prints what will change and asks for confirmation. Run it again to step further back (the last 10 mutations are kept). Only local state is restored: remote branches and PRs are not touched, and `submit` is not undoable. Refuses while a rebase is in progress or with uncommitted tracked changes.

| Flag | Description |
| --- | --- |
| `-f`, `--force` | Undo without asking for confirmation. |

```
ch undo
```

### `abort`
Abort the most recent Charcoal command halted by a merge conflict: aborts the in-progress rebase, discards the queued continuation, and returns to the branch the command started from. Branches the command had already restacked before the conflict stay restacked.

| Flag | Description |
| --- | --- |
| `-f`, `--force` | Don't prompt for confirmation. |

```
ch abort -f
```

---

## Submit & sync

### `submit` (alias `s`)
Idempotently force-push all branches from trunk to the current branch to GitHub, creating or updating a distinct PR for each. **Defaults to the current downstack** (trunk → current); pass `--stack` to also include descendants.

| Flag | Description |
| --- | --- |
| `-s`, `--stack` | Also submit the current branch's descendants, in addition to its ancestors. Without `--stack`, interactive submits offer to include the branches above the current one that already have open PRs; `--no-stack` skips that question. |
| `-d`, `--draft` | Create new PRs as drafts (existing PRs are left as they are). In `--no-interactive` mode, new PRs are created as drafts. |
| `-p`, `--publish` | Publish PRs: new PRs are created ready for review, and existing drafts are marked ready. |
| `-e`, `--edit` / `-n`, `--no-edit` | Edit the title and description of every PR (`--edit`) or none (`--no-edit`, which wins). By default only new PRs prompt. |
| `--edit-title` / `--no-edit-title` | Prompt (or don't) for the PR title. `--edit-title` beats `--no-edit`; `--no-edit-title` beats `--edit-title` and `--edit`. |
| `--edit-description` / `--no-edit-description` | Same, for the PR description. |
| `-r`, `--reviewers` | Prompt for reviewers, or pass a comma-separated list. An explicit list also applies with `--no-interactive`. When a submit mixes new and existing PRs, you're asked whether the reviewers go on all of them or only the new ones. |
| `-t`, `--team-reviewers` | Comma-separated team slugs (`slug` means the repo owner's team; `org/slug` also works). Without a value, opens the reviewers prompt. |
| `--dry-run` | Report which PRs would be submitted, then exit. Nothing is pushed. |
| `-c`, `--confirm` | Report the PRs and ask for confirmation before pushing. Ignored with `--no-interactive`/`--dry-run`. |
| `--select` | Report the PRs and ask which to update/create. Ignored with `--no-interactive`/`--dry-run`. |
| `-u`, `--update-only` | Only update PRs that have already been submitted. |
| `-f`, `--force` | Force push (overwrites remote). Otherwise defaults to `--force-with-lease`. |
| `--always` | Always push updates even if the branch is unchanged. |
| `--comment <msg>` | Add a comment with `<msg>` to every submitted PR. |
| `-m`, `--merge-when-ready` | Enable auto-merge (`gh pr merge --auto --squash`) on every submitted PR. |
| `--rerequest-review` | Re-request review from the current reviewers of every updated PR. |
| `-v`, `--view` | Open the PR in the browser after submitting. |
| `--restack` | Restack the branches before submitting. Branches that would conflict are left unrestacked and listed (the submit then stops on them). |
| `--ignore-out-of-sync-trunk` | Submit even if trunk differs from its remote. Otherwise submit warns, then asks (or, with `--no-interactive`, fails). |
| `--cli` | Accepted for gt compatibility; Charcoal always edits PR metadata in the CLI. |
| `--branch` | Submit as if `<branch>` were checked out (default: current branch). |
| `--gh-stack` / `--no-gh-stack` | Link (or don't link) the PRs as a GitHub stack. Defaults to the `repo github-stacks` setting (on). |

**GitHub stacks.** After pushing, submit links the chain of PRs from trunk up through the current branch, and on through its descendants that have open PRs, as a native GitHub stack (`gh stack`): it creates the stack, appends new PRs to it, or — if the stack on GitHub no longer matches (reordered, removed or re-parented PRs) — unstacks and recreates it. Frozen branches are included when they have a PR. A chain with fewer than two PRs is not linked. GitHub stacks are linear, so if the local stack is a tree, submit links the longest chain through the current branch and warns about the branches left out. Repos without stacked PRs enabled are skipped silently; any other GitHub error is a warning and never fails the submit. The stack number is shown next to the bottom branch in `ch ls`/`ch log`. Turn it off per repo with `ch config` (`repo github-stacks`).

```
ch submit              # submit trunk -> current
ch submit --stack -d   # whole stack, as drafts
ch submit --dry-run
```

### `sync`
Pull the trunk branch from remote, delete branches whose PRs have been merged or closed (asking for each), and restack every branch that can be restacked without conflicts. If trunk can't be fast-forwarded, it is overwritten with the remote version (after asking, unless `--force`).

Branches whose restack would conflict are left where they were and listed at the end ("All branches restacked cleanly, except for: …"); check each out and run `ch restack` to resolve them. Sync itself never stops in conflict resolution.

| Flag | Description |
| --- | --- |
| `-d`, `--delete-all` | Delete all merged or closed branches without prompting. |
| `-f`, `--force` | Don't prompt before deleting a branch or resetting trunk to remote. |
| `--restack` / `--no-restack` | Restack branches after syncing (default on). |
| `--pull` / `--no-pull` | Pull the trunk branch from remote (default on). |
| `--delete` / `--no-delete` | Look for merged/closed branches to delete (default on). |
| `--show-delete-progress` | Show progress through merged branches. |

```
ch sync
ch sync -d             # delete merged branches without asking
ch sync --no-restack
```

### `merge` (alias `mg`)
Merge the PRs from trunk up to the current branch, bottom-up, via `gh pr merge`. Every branch in the downstack must have an open PR; otherwise the command lists the ones that don't and merges nothing.

| Flag | Description |
| --- | --- |
| `--dry-run` | Print the PRs that would be merged, in order, and exit. |
| `-c`, `--confirm` | Print the plan and ask before merging. Ignored with `--no-interactive`. Merge also asks, regardless of this flag, when a local branch differs from its remote (GitHub merges the remote version); with `--no-interactive` it refuses instead. |
| `--method` | `squash` (default), `merge`, or `rebase`. |
| `--auto` | Enable auto-merge on the bottom PR instead of merging it now, then stop; later PRs can't merge until it lands, so run `ch merge` again afterwards. |

After each merge, the next branch is reparented onto trunk (pulled fresh), restacked so it drops the merged parent's commits (this works after a squash because Charcoal remembers the parent revision it was based on), retargeted to trunk on GitHub, and force-pushed (with lease) before its own PR is merged. If a merge fails (required checks or approvals, conflicts), the command stops, names that PR, and leaves the PRs above it untouched. Merged branches stay local until `ch sync` deletes them. `ch undo` does not cover `merge`.

```
ch merge --dry-run
ch merge -c
ch merge --method rebase
```

### `auth`
Authenticate with the GitHub CLI so Charcoal can create and manage PRs.

| Flag | Description |
| --- | --- |
| `-t`, `--token` | Store this GitHub token with `gh auth login --with-token` (the token is passed on stdin and never printed). |

```
ch auth
ch auth -t <token>
```

### `pr`
Open a PR page in the browser (via `gh pr view --web`). Defaults to the current branch's PR. A numeric argument that isn't a branch name is treated as a PR number. Errors if a branch has no PR.

| Flag | Description |
| --- | --- |
| `[branch-or-pr]` | Positional: branch name or PR number to open. |
| `-s`, `--stack` | If the branch's PR is in a GitHub stack, open every PR in that stack (including ones not tracked locally). Otherwise open the PR of every branch in the local stack (ancestors and descendants, excluding trunk), erroring without opening anything if any branch has no PR. |

```
ch pr
ch pr feature-x
ch pr 123
ch pr --stack
```

### `unlink`
Clear the PR associated with a branch in Charcoal's metadata, so the next `submit` creates a new PR. Does not touch the PR on GitHub. Note: `submit` and `sync` re-link a branch to an **open** PR whose head is that branch, so close the old PR (or rename the branch) first. Defaults to the current branch.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to unlink. |

```
ch unlink
ch unlink feature-x
```

### `unstack`
Dissolve the GitHub stack that contains the current branch's PR. The PRs and local branches are untouched; GitHub keeps PRs that are queued for merge or have auto-merge enabled stacked, and `unstack` lists them. Asks for confirmation unless `--force` or `--no-interactive`. Remote-only, so it isn't undoable with `ch undo` (the next `submit` re-links the stack unless `--no-gh-stack` is passed).

| Flag | Description |
| --- | --- |
| `-f`, `--force` | Don't ask for confirmation. |

```
ch unstack
ch unstack -f
```

---

## Collaborate

### `freeze`
Freeze a branch and every branch downstack of it, down to trunk. Use it on branches that belong to someone else (for example a teammate's stack you are building on), so Charcoal never rewrites them. Defaults to the current branch.

Charcoal refuses to modify, squash, split, fold, rename, move, pop, edit, push, or `modify --into` a frozen branch, and refuses to delete it unless it has been merged or closed (so `sync` still cleans it up). `restack` skips frozen branches and restacks the unfrozen branches above them onto their current tip; `submit` skips them and still submits the branches above. You can still `create` branches on top of a frozen branch. `log` and `ls` mark frozen branches with `(frozen)`.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to freeze. |

```
ch freeze teammate-branch
```

### `unfreeze`
Unfreeze a branch and every branch upstack of it, so Charcoal can modify them again. Defaults to the current branch.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to unfreeze. |

```
ch unfreeze teammate-branch
```

### `get` (alias `g`)
For a branch or PR number, sync the branches from trunk to it from remote (rebuilt by walking each PR's base), prompting to resolve conflicts. If the branch already exists locally, its local upstack branches that have PRs are synced too (`--downstack` opts out); remote-only branches above it are only fetched with `--remote-upstack`. With no argument, syncs the current stack. Then, like `sync`, it offers to delete the stack's merged or closed branches and restacks what restacks cleanly, and checks out the branch. Useful for pulling a teammate's stack.

New branches authored by someone else are [frozen](#freeze), so you can stack on top of them without rewriting them; your own PRs' branches (by `gh api user`) come down unfrozen, and branches you already had keep their frozen state. A frozen local branch that differs from remote is overwritten with the remote version, without prompting. When rebasing your local changes onto the remote version hits conflicts, you can resolve them (then `ch continue`) or cancel, which undoes that rebase and stops.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch name or PR number to get. |
| `-d`, `--downstack` | When the branch already exists locally, don't sync its upstack branches. |
| `-u`, `--remote-upstack` | Also get the open PRs above the branch on remote: the rest of its GitHub stack if it's in one, otherwise the open PRs based on it, recursively. |
| `--checkout` / `--no-checkout` | Check out the branch afterwards (default on). |
| `--restack` / `--no-restack` | Restack the stack afterwards, leaving branches that would conflict as they are (default on). |
| `--delete-all` | Delete the stack's merged or closed branches without prompting. |
| `-f`, `--force` | Overwrite all fetched branches with the remote source of truth. |
| `-U`, `--unfrozen` | Leave every new branch unfrozen. Branches that are already frozen stay frozen. |

```
ch get teammate-branch
ch get 123 -u           # PR #123 and everything stacked above it
```

---

## Inspect

### `log` (alias `l`)
Command group that logs your stacks.

- `ch log` (default) — log all branches tracked by Charcoal, showing dependencies and info for each.
- `ch log short` (alias `s`) — log all stacks, arranged to show dependencies.
- `ch log long` (alias `l`) — display a graph of the commit ancestry of all branches.

Shared flags (on `ch log` and `ch log short`):

| Flag | Description |
| --- | --- |
| `--classic` | Use the old short logging style (other options are ignored in classic mode). On `ch log short`/`ch ls`, also `-c`. |
| `-r`, `--reverse` | Print the log upside down. |
| `-s`, `--stack` | Only show ancestors and descendants of the current branch. |
| `-n`, `--steps` | Only show this many levels up/downstack. Implies `--stack`. |
| `-u`, `--show-untracked` | Include untracked branches. |

### `ls`
Top-level shortcut for `log short`: log all stacks tracked by Charcoal, arranged to show dependencies.

| Flag | Description |
| --- | --- |
| `-c`, `--classic` | Use the old logging style (other options are ignored in classic mode). |
| `-r`, `--reverse` | Print the log upside down. |
| `-s`, `--stack` | Only show ancestors and descendants of the current branch. |
| `-n`, `--steps` | Only show this many levels up/downstack. Implies `--stack`. |
| `-u`, `--show-untracked` | Include untracked branches. |

```
ch ls
ch ls -s
```

### `ll`
Top-level shortcut for `log long`: display a graph of the commit ancestry of all branches.

```
ch ll
```

### `info` (alias `i`)
Display information about the current (or provided) branch: its parent, children and commits.

| Flag | Description |
| --- | --- |
| `[branch]` | Positional: branch to show. Defaults to the current branch. |
| `-p`, `--patch` | Show the changes made by each commit. |
| `-d`, `--diff` | Show the diff between this branch and its parent. Takes precedence over `--patch`. |
| `-s`, `--stat` | Show a diffstat instead of a full diff. Modifies `--patch` or `--diff`; implies `--diff` if neither is passed. |
| `-b`, `--body` | Show the PR body, if it exists. |

```
ch info -d
ch info feature-x -s
```

### `parent`
Print the current branch's parent. Errors on trunk or an untracked branch.

```
ch parent
```

### `children`
Print the current branch's children, one per line.

```
ch children
```

### `trunk`
Print the trunk branch name.

| Flag | Description |
| --- | --- |
| `-a`, `--all` | Show all configured trunks. Charcoal supports one trunk, so this prints it. |

```
ch trunk
```

---

## Config

### `config`
Interactive front end over the settings managed by `ch user` and `ch repo`. Lists every setting with its current value, lets you pick one, and prompts for the new value. Repo settings are only shown inside a repo. With `--no-interactive`, prints the current settings and exits.

One setting lives only here: `user sync-auto-delete` makes `ch sync` delete merged/closed branches without asking (as if `-f` was passed for deletion), also in non-interactive mode.

```
ch config
ch config --no-interactive
```

### `aliases`
User-defined command aliases, kept in `~/.config/charcoal/aliases` (`$XDG_CONFIG_HOME/charcoal/aliases` when that is set). One alias per line, `<alias> <expansion...>`; blank lines and `#` comments are ignored. When the first word you type matches an alias, Charcoal replaces it with the expansion and keeps the rest of your arguments (`ch ss -d` runs `ch submit --stack -d`). Aliases can't shadow built-in commands or git passthrough commands; such a line is ignored with a warning.

`ss` (`submit --stack`), `ls` (`log short`) and `ll` (`log long`) are defined by default and must be overridden to be disabled (`ls`/`ll` are also built-in commands). The file is created with these defaults on first use, and recreated if you delete it. An existing `~/.graphite_aliases` from an older Charcoal is moved there once.

`ch aliases` opens the file in your editor (prints it with `--no-interactive`).

| Flag | Description |
| --- | --- |
| `--reset` | Reset the file to the default aliases. |
| `--legacy` | Append Graphite's [legacy alias preset](https://graphite.com/docs/legacy-alias-preset): the pre-v1.0 shortcuts mapped to the flat commands that replaced them (`bc` → `create`, `bco` → `checkout`, `bu`/`bd` → `up`/`down`, `ca` → `modify`, `cc` → `modify --commit`, `bs`/`dss` → `submit`, `uss` → `submit --stack`, `sr` → `restack`, `br` → `restack --only`, `usr`/`dsr` → `restack --upstack`/`--downstack`, `uso` → `move --onto`, `dse` → `reorder`, `be` → `modify --interactive-rebase`, `dsm` → `merge`, `ri` → `init`, `rs` → `repo sync`, and the rest of the `b*`/`ds*` family). Aliases you already defined are kept. |

```
ch aliases
ch aliases --legacy
```

### `repo`
Read or write Charcoal's per-repo configuration. Sub-commands generally read the current value when run with no flag and write it with `-s`/`--set`.

| Sub-command | Description |
| --- | --- |
| `repo init` (alias `i`) | Create or regenerate a `.graphite_repo_config` file. Flags: `--trunk <name>`, `--reset` (untrack all branches). |
| `repo sync` (alias `s`) | Same as the top-level `sync` (pull trunk, delete merged branches). Flags: `-p`/`--pull`, `-d`/`--delete`, `--show-delete-progress`, `-f`/`--force`, `-r`/`--restack`. |
| `repo name` | The repo's name in Charcoal (e.g. `charcoal` in `danerwilliams/charcoal`). `-s`/`--set` to override. |
| `repo owner` | The repo owner's name in Charcoal. `-s`/`--set` to override. |
| `repo remote` | The remote Charcoal pushes to / pulls from (defaults to `origin`). `-s`/`--set` to override. |
| `repo pr-templates` | List your GitHub PR templates, used to pre-fill PR bodies on submit. |
| `repo github` | Toggle the GitHub integration for this repo. `--enable` to set on/off. |

```
ch repo init --trunk main
ch repo remote -s upstream
```

> The previous command name `repo disable-github` is now `repo github` (toggle via `--enable`).

### `user`
Read or write Charcoal's user-level configuration. Sub-commands read the current value with no flag and write it with the flags below.

| Sub-command | Description |
| --- | --- |
| `user editor` | The editor Charcoal opens. `--set <editor>` (e.g. `--set vim`), `--unset`. |
| `user pager` | The pager Charcoal opens. `--set "less -FRX"`, `--disable`, `--unset` (fall back to git's pager). |
| `user tips` | Show tips while using Charcoal. `--enable`, `--disable`. |
| `user branch-prefix` | Prefix prepended to generated branch names. `-s`/`--set <prefix>`, `-r`/`--reset` (takes precedence over `--set`). |
| `user branch-date` | Prepend the date to auto-generated branch names. `--enable`, `--disable`. |
| `user branch-replacement` | Character that replaces unsupported characters in generated branch names. `--set-underscore`, `--set-dash`, `--set-empty`. |
| `user restack-date` | How committer date is handled by restack's internal rebases. `--use-author-date` passes `--committer-date-is-author-date`. |
| `user submit-body` | Defaults for PR descriptions. `--include-commit-messages` includes commit messages in the PR body by default. |

```
ch user editor --set "code --wait"
ch user branch-prefix -s dane/
```

---

## Setup & misc

### `init`
Create or regenerate a `.graphite_repo_config` file for the current repo (same as `repo init`).

| Flag | Description |
| --- | --- |
| `--trunk` | The name of your trunk branch. |
| `--reset` | Untrack all branches. |

```
ch init --trunk main
```

### `completion`
Print a yargs bash/zsh completion script to stdout. Append it to your shell profile to enable tab completion. Branch names are completed for `checkout`, `delete`, `track`, `untrack`, `move`, `get`, `info`, `freeze`, `unfreeze`, `unlink` and `pr`.

```
ch completion >> ~/.bashrc
```

### `fish`
Set up fish-shell tab completion.

```
ch fish
```

### `feedback`
Command group for providing feedback and debug state.

- `ch feedback debug-context` — print a debug summary of your repo, useful for bug reports.

```
ch feedback debug-context
```

### `demo`
Run an interactive demo of Charcoal.

```
ch demo
```
