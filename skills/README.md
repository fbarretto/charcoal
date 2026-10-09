# Agent skills

`charcoal/` is an [agent skill](https://docs.claude.com/en/docs/claude-code/skills) that teaches Claude Code (and other agents that read `SKILL.md` files) to manage stacked PRs with `ch`.

Install it for every project by copying or symlinking the directory into your personal skills folder:

```bash
cp -R skills/charcoal ~/.claude/skills/          # copy
ln -s "$PWD/skills/charcoal" ~/.claude/skills/   # or symlink, to pick up updates with git pull
```

For a single repo, put it in that repo's `.claude/skills/` instead. Restart the agent session so it loads.
