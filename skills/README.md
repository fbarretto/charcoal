# Agent skills

`charcoal/` is an [agent skill](https://docs.claude.com/en/docs/claude-code/skills) that teaches Claude Code (and other agents that read `SKILL.md` files) to manage stacked PRs with `ch`.

The skill is built into `ch`, so the simplest install matches your `ch` version:

```bash
ch skill install             # ~/.claude/skills/charcoal/SKILL.md, for every project
ch skill install --project   # .claude/skills/charcoal/SKILL.md in the current repo
```

Run it again after `ch upgrade`. To track `main` instead, symlink this directory: `ln -s "$PWD/skills/charcoal" ~/.claude/skills/`. Restart the agent session so it loads.
