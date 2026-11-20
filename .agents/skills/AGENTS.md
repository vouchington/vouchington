# Skills

- Local skills live in `.agents/skills/<name>/SKILL.md`; keep descriptions short and state the task
  trigger. Expose each to Claude with
  `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`;
  do not create symlinks manually. The one-to-one mapping is enforced by
  [`finite-set-consistency`](../../.no-mistakes/rules/policies.yml).
- Generic skills come from the `jong-skills` plugin (repo `jonathanong/harness-plugins`) and
  Vouchington-specific ones from `vouchington-tooling`. Do not add adapters or vendor upstream
  skills; repository constraints belong in `AGENTS.md`, explanations in `docs/**`
  ([placement](../../docs/AGENTS.md)).
- Read this file explicitly when authoring skills; Claude's subtree discovery skips `.agents`.
