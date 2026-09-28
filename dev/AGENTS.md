# Development tools

- Use [start of work](../.agents/skills/agent-workflow/start-of-work.md), [local site testing](../.agents/skills/local-site-testing/SKILL.md), and [command catalog](../docs/development/local-development/README.md). Load [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks.
- Run commands from the current worktree root. Agents start the web stack with `./dev/initialize web` then `./dev/tmux`; individual services are human diagnostics, not startup fallbacks. Use [recovery](../docs/development/tests.md#local-web-validation-recovery) only after this fails.
- Schema/destructive targets resolve through [`lib/db-target.sh`](lib/db-target.sh). `DATABASE_URL` is authoritative; non-local writes require operation-specific catalog opt-ins.
- Parse worktrees through [`lib/git-worktrees.sh`](lib/git-worktrees.sh). Main owns shared `voucha`/`voucha-valkey`; never bypass main-reset guards or globally export `FORCE_MAIN_RESET=1`. Full `.grok/worktrees`/temporary clones are not main; non-main stale databases follow root ephemeral-state policy.
- Shell scripts support macOS Bash 3.2 and shellcheck. Conditional arrays under `set -u` use `"${arr[@]+"${arr[@]}"}"`. Never assign zsh's read-only `status`/`pipestatus`; use `cmd_status` or `curl_status` (see [`ci/curl-to.sh`](../ci/curl-to.sh)).
- Host installation belongs in [vouchington-machines](https://github.com/vouchington/vouchington-machines), never this product repository; keep [system dependencies](../docs/development/system-dependencies.md) aligned.
- Hook code/tests follow [agent-hook instructions](codex-hooks/AGENTS.md).
