# Claude Skills

Skills authored in this repo live in `.agents/skills/<name>/`. Author `.agents/skills/<name>/SKILL.md` first, then run `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills` to create the tracked Claude discovery symlink. Do not use ad hoc `ln -s`. There is no third discovery surface: Codex, Grok, Cursor, and OpenCode load `.agents/skills/` directly. Do not add a `.codex/agents` adapter, `agents/openai.yaml`, or `.claude/agents` file unless the skill is a dispatchable specialist.

Every skill must be exposed to Claude Code through that tracked symlink; there is no per-skill opt-in flag. The 1:1 mapping is enforced by the `Claude skill discovery set consistency` `finite-set-consistency` rule in [`.no-mistakes.yml`](../../.no-mistakes.yml).

Skill entry points are indexed from [the agent catalog](../catalog/README.md). Skills that split into `reference-*.md` leaves also keep a local `CLAUDE.md` pointing at their `README.md`.

Do not vendor upstream skills in this repository.
