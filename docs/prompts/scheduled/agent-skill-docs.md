Review the agent instruction layer for contradictions, stale carve-outs, and unclear guidance. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one skill or one scoped `AGENTS.md`.

- Review `.agents/skills/**/*.md`, `AGENTS.md`, and related workflow docs for rules that overlap, conflict, or drifted from current repo behavior. General documentation hygiene belongs to [docs.md](docs.md).
- Load `documentation`. Give each rule one canonical owner and fix the narrowest file that owns it; replace duplicates with a short pointer. A thin new skill is justified only when no existing skill's description triggers on the task.
- When adding or renaming a skill, link it with `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`.
- Model, sandbox, and approval policy are machine-owned; do not recreate a model-routing table.
- Run documented commands from the documented working directory. For native localization contracts, follow the [translation validation guide](../../development/reference-tests-translation-catalog-and-locale-checks.md).
