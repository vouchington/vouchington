Review the agent instruction layer for contradictions, stale carve-outs, and unclear guidance. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Review `.agents/skills/**/*.md`, `CLAUDE.md`, and related workflow docs for instructions that overlap, conflict, or have drifted from current repo behavior.
- Use this prompt for agent-facing instruction contradictions or drift; use [docs.md](docs.md) for general documentation hygiene, README coverage, link linting, and bidirectional docs links.
- Prefer fixing the narrowest file that owns the rule instead of spreading the same clarification across multiple docs.
- Classify each candidate before editing: keep an automatically scoped invariant in the nearest
  `CLAUDE.md`; route task-triggered procedure to an existing skill; move commands, examples, and
  explanation to canonical docs or a README; or create a thin new skill only when no existing skill
  has an adequate trigger.
- Treat an existing skill as adequate when its description already triggers on the task's specific
  tool, file pattern, or workflow step. Create a thin skill only when none does; name the missing
  trigger and keep the new skill bounded to that gap.
- Give each rule or procedure exactly one canonical owner. Replace duplicated text with a short,
  imperative pointer that tells the agent when to load that owner.
- When adding or renaming a skill, run
  `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`
  so `.agents/skills/<name>` and the tracked `.claude/skills/<name>` symlink stay in parity. Do not
  use ad hoc `ln -s`. Do not add a dedicated agent adapter for a task-triggered checklist skill.
- Remove superseded duplicates in the same bounded change, but still pick exactly one concrete
  improvement rather than attempting a repository-wide rewrite.
- Keep the change self-contained and durable: update the instruction that future agents will actually read, not a one-off session note.
- Make the result easier to scan or less ambiguous without broadening scope into unrelated docs cleanup.
- Execute documented commands with the installed tool from the documented working directory; do not
  accept examples that only look syntactically plausible.
- When the selected improvement affects the native-localization or native-consumer contract, use the
  [canonical translation validation guide](../../development/reference-tests-translation-catalog-and-locale-checks.md).
  In the implementation choice and validation plan, name the runnable exporter-staged isolated
  consumer setup: `node dev/native-localization.mts` with `--output-root` and `--consumer-root`
  pointing at the isolated `vouchington-clients` checkout, plus `--check`; also name locked .NET
  solution validation: `dotnet-clients/tooling/with-build-lock.sh dotnet test
dotnet-clients/Voucha.DotNet.sln --configuration Release`. Make explicit that Vouchington is the
  producer while the external vouchington-clients checkout is the consumer.
- Find conditional flags whose callers all pass the same value; replace one such flag with a
  structural invariant and remove the unreachable branch.
- Compare `.codex/agents/*.toml` model, reasoning-effort, and sandbox settings with the agent-workflow
  routing table, and fix one concrete mapping drift.
- Review the three lifecycle checklist skills (`git-commit-checklist`, `package-json-checklist`, `github-actions-checklist` in `.agents/skills/`) and their matching `docs/checklists/**` pages and `.codex/agents/**` adapters for consistency: principles match, cross-links are bidirectional, and nothing has drifted from the `CLAUDE.md` pointers or authoritative source docs.
