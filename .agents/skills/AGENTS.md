# Skills

- Author local skills in `.agents/skills/<name>/SKILL.md`. Keep descriptions short and state the
  task trigger; keep entrypoints focused and load supporting procedures only when needed.
- Prefer a local adapter for repository work. It loads its canonical Vouchington plugin, or the
  installed `node_modules/vouchington-tooling/skills/<name>/SKILL.md` fallback, then local policy.
  `web-vitest-test-authoring` adapts canonical `nextjs-vitest-test-authoring`. Do not reload a
  canonical skill or adapter already read, and do not vendor upstream skills.
- Shared procedures belong in `vouchington-tooling`; repository constraints belong here.
  Explanatory documentation belongs in `docs/**`. Follow [placement](../../docs/AGENTS.md).
- Read this file explicitly when authoring or using skills; Claude's automatic subtree discovery
  skips `.agents`. Other startup loaders also do not read all target-directory instructions.
- Expose each skill to Claude with
  `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`.
  Do not create symlinks manually. The tracked one-to-one mapping is enforced by
  [`finite-set-consistency`](../../.no-mistakes.yml).
- Codex, Grok, Cursor, and OpenCode discover `.agents/skills` directly. Add no extra agent adapter
  or `agents/openai.yaml` unless the skill is a dispatchable specialist.
- Register skills in [the catalog](../catalog/README.md). Verify local and canonical links,
  referenced resources, aliases, and installation prerequisites; installation closure does not
  mean every prerequisite must be eagerly read.
