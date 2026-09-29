Review the agent instruction layer for contradictions, stale carve-outs, and unclear guidance. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

- Review `.agents/skills/**/*.md`, `AGENTS.md`, and related workflow docs for instructions that overlap, conflict, or have drifted from current repo behavior.
- Use this prompt for agent-facing instruction contradictions or drift; use [docs.md](docs.md) for general documentation hygiene, README coverage, link linting, and bidirectional docs links.
- Prefer fixing the narrowest file that owns the rule instead of spreading the same clarification across multiple docs.
- Classify each candidate before editing: keep an automatically scoped invariant in the nearest
  `AGENTS.md`; route task-triggered procedure to an existing skill; move commands, examples, and
  explanations to canonical `docs/**`; or create a thin new skill only when no existing skill has
  an adequate trigger. Source `README.md` files are short navigation entrypoints.
- Treat an existing skill as adequate when its description already triggers on the task's specific
  tool, file pattern, or workflow step. Create a thin skill only when none does; name the missing
  trigger and keep the new skill bounded to that gap.
- Give each rule or procedure exactly one canonical owner. Replace duplicated text with a short,
  imperative pointer that tells the agent when to load that owner.
- When adding or renaming a skill, run
  `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`
  so `.agents/skills/<name>` and the tracked `.claude/skills/<name>` symlink stay in parity. Do not
  use ad hoc `ln -s`. Do not add a dedicated agent adapter for a task-triggered checklist skill.
- Remove superseded duplicates in the same bounded change, but still pick at most one concrete
  improvement rather than attempting a repository-wide rewrite.
- Keep the change self-contained and durable: update the instruction that future agents will actually read, not a one-off session note.
- Make the result easier to scan or less ambiguous without broadening scope into unrelated docs cleanup.
- Execute documented commands with the installed tool from the documented working directory; do not
  accept examples that only look syntactically plausible.
- When the selected improvement affects native localization or its consumer contract, follow the
  [canonical translation validation guide](../../development/reference-tests-translation-catalog-and-locale-checks.md)
  and run the validation it assigns to the changed producer or consumer.

- Compare `.codex/agents/*.toml` settings with the owning `.codex/config.toml` and specialist role or
  skill definitions. Fix one concrete mismatch only when the owning source establishes the intended
  value; do not recreate a separate model-routing table.
- Review the three lifecycle checklist skills (`git-commit-checklist`, `package-json-checklist`, `github-actions-checklist` in `.agents/skills/`) and their matching `docs/checklists/**` pages and `.codex/agents/**` adapters for consistency: principles match, cross-links are bidirectional, and nothing has drifted from the `AGENTS.md` pointers or authoritative source docs.
