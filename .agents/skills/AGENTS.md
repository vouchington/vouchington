# Skills

- Author local skills in `.agents/skills/<name>/SKILL.md`. Keep descriptions short and state the
  task trigger; keep entrypoints focused and load supporting procedures only when needed.
- Prefer a local adapter for repository work. It loads its canonical skill, then local policy.
  A generic skill is canonical in the public `skills` plugin (marketplace `jonathanong-skills`,
  repo `jonathanong/skills`); Claude Code, Codex, and Grok load it as `skills:<name>`, with no
  `node_modules` fallback. A Vouchington-specific skill is canonical in `vouchington-tooling`
  (`vouchington-workflow:<name>`, with the installed
  `node_modules/vouchington-tooling/skills/<name>/SKILL.md` fallback). Local names that differ from
  upstream: `web-vitest-test-authoring` is the alias for the Next.js section of
  `skills:test-authoring` `references/vitest.md`; `github-actions-checklist` adapts
  `skills:github-actions-authoring`. Do not reload a canonical skill or adapter already read, and
  do not vendor upstream skills.
- Generic procedure belongs in `jonathanong/skills`, Vouchington-specific procedure in
  `vouchington-tooling`; repository constraints belong here.
  Explanatory documentation belongs in `docs/**`. Follow [placement](../../docs/AGENTS.md).
- Read this file explicitly when authoring or using skills; Claude's automatic subtree discovery
  skips `.agents`. Other startup loaders also do not read all target-directory instructions.
- Expose each skill to Claude with
  `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`.
  Do not create symlinks manually. The tracked one-to-one mapping is enforced by
  [`finite-set-consistency`](../../.no-mistakes/rules/policies.yml).
- Codex, Grok, Cursor, and OpenCode discover `.agents/skills` directly. Skills get no per-skill agent
  adapter or `agents/openai.yaml`.
- Register skills in [the catalog](../catalog/README.md). Verify local and canonical links,
  referenced resources, aliases, and installation prerequisites; installation closure does not
  mean every prerequisite must be eagerly read.
