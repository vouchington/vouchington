# Multi-Worktree Development Environment

Use [Start of Work](../.agents/skills/agent-workflow/start-of-work.md) for setup selection and
[local-site-testing](../.agents/skills/local-site-testing/SKILL.md) for the full web stack. The
canonical command catalog, initialization behavior, ports, and diagnostics live in
[README.md](README.md).

Before adding or changing a Vitest test, fixture, or mock here, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).

## Scoped invariants

- Run every command from the current worktree root. Agents start the web stack only with
  `./dev/initialize web` followed by `./dev/tmux`; individual service commands are human-facing
  diagnostics, not an agent startup fallback.
- Resolve PostgreSQL schema-writing or destructive targets through [`lib/db-target.sh`](lib/db-target.sh).
  `DATABASE_URL` is authoritative; non-local writes require the operation-specific opt-in documented
  in the command catalog.
- Parse worktrees through [`lib/git-worktrees.sh`](lib/git-worktrees.sh). The main worktree owns the
  shared `voucha` database and `voucha-valkey` container; never bypass the command-specific main-reset
  guard or export `FORCE_MAIN_RESET=1` globally. Full clones under `.grok/worktrees` or
  `${TMPDIR:-/tmp}` are not the main worktree.
- Keep shell scripts compatible with macOS Bash 3.2 and shellcheck. For conditionally populated
  arrays under `set -u`, use `"${arr[@]+"${arr[@]}"}"`. Never assign `status` or `pipestatus`
  in scripts or ad-hoc commands: zsh treats them as read-only builtins, and shellcheck does
  not flag that collision. Capture exit codes as `curl_status` (see [`ci/curl-to.sh`](../ci/curl-to.sh))
  or `cmd_status`.
- Keep host package installation outside this product repository. The canonical host setup is
  [vouchington-machines](https://github.com/vouchington/vouchington-machines);
  keep [system dependency docs](../docs/development/system-dependencies.md) synchronized with that
  ownership boundary.
- Agent hook code (`codex-hooks/`, `codex-hooks-tests/`) follows
  [codex-hooks/CLAUDE.md](codex-hooks/CLAUDE.md).

Use [local web validation recovery](../docs/development/tests.md#local-web-validation-recovery) only
after the supported initialization path fails.
