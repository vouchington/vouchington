# Agent Sandbox: OS-Level Containment For Claude And Codex

**The rule:** `git *`, `gh *`, `docker *`, `pnpm exec *`, `pnpm run *`, `pnpm --dir *`, `pnpm install`,
`pnpm test`, `pr-shepherd *`, `no-mistakes *`, `ps aux`, and a narrow set of specific
`npx <tool> *` / `node dev/*.mts` invocations (`pr-shepherd`, `vitest`, `oxlint`, `oxfmt`,
`no-mistakes`, `pr-description.mts`, `plan-issue.mts`) bypass Claude's
OS-level sandbox through `.claude/settings.json`. Codex always
stays in `workspace-write`; prefixes in `.codex/rules/default.rules` are
pre-approved but still sandboxed, and every other command goes through on-request auto-review.
`git rebase`, `git stash`, `git cherry-pick`, `gh run`, `gh api`, and `gh workflow` are not
Codex-pre-approved: they skip Claude `permissions.allow` after
jonathanong/filaments PR #9574 and skip Codex `prefix_rule` after a
later change (formerly filed as jonathanong/filaments#9578), so Codex `auto_review` sees the
argv. The checked-in policy is what a reactivated CI Codex session would load; harness dispatch
is currently fail-closed and does not execute these prefixes. See
[Auto Harness automation security boundary](../../.github/workflows/reference-harness-automation-accepted-risk.md)
for the accepted risk.

## Two independent containment layers

Every agent tool call in this repo passes through two layers that don't overlap:

1. **The PreToolUse policy hook** (`dev/codex-hooks/pre-tool-use.mts` → `policy.mts`) — semantic
   gating: force-push, `--amend`, dev-server launches, hook self-mutation, and merge
   authority (see [Merge Authority](merge-authority.md)). Wired identically for Claude
   (`.claude/settings.json`'s `PreToolUse` hook) and Codex, and it fires **regardless** of
   whether the command is OS-sandboxed.
2. **The OS sandbox** (Landlock/seccomp on Linux, the App Sandbox on macOS) — filesystem
   read/write scoping and network allowlisting at the kernel/OS level. This is what
   `sandbox.excludedCommands` bypasses. An excluded command still goes through the hook above; it
   just isn't also confined by the OS.

Narrowing `excludedCommands` only affects layer 2. It does not add or remove any semantic gate.

## Hook threat model

Layer 1 is a guardrail against a cooperative agent's honest mistakes, such as a habitual
force-push, a `--no-verify` retry, a merge from automation, or a PR opened ready instead of draft.
It is not a security boundary. A command can always reach the same effect through forms the hook
never sees (`python -c`, `node -e`, a script file, `echo … | bash`), so the hook does not parse
obfuscated or indirect forms, and bypass reports of that kind are out of scope. The boundaries are
the OS sandbox (layer 2), branch protection on `main`, and the harness permission prompt when the
session's approval mode asks for one. Codex `--ask-for-approval never` skips the prompt and leaves
the first two; `--dangerously-bypass-approvals-and-sandbox` also drops the OS sandbox and leaves only
branch protection (see [the decision flow](reference-merge-authority-decision-flow.md)).

The hook blocks coarsely and allows precisely. A block may overmatch, and any block in a command
beats an allow. In automation, for example, any command text the hook reads that names `gh`
together with a merge blocks, quoted or not; the
[decision flow](reference-merge-authority-decision-flow.md) names its accepted overmatches and the
forms it never reads. The one allow is a single plain merge in an attended Claude session (see
[Merge Authority](merge-authority.md)). Rules for changing the hooks live in
[dev/codex-hooks/CLAUDE.md](../../dev/codex-hooks/CLAUDE.md).

## Claude and Codex sandbox semantics are different, not parallel

- **Claude:** `sandbox.excludedCommands` = runs _outside_ the OS sandbox. `permissions.allow` =
  auto-approved (no confirmation prompt). These are **independent** — a command can be allowed
  (no prompt) and still fully OS-sandboxed, or excluded (unsandboxed) and still require a prompt.
- **Codex:** `prefix_rule(pattern=[...], decision="allow")` in `.codex/rules/*.rules` = auto-approved
  **but still OS-sandboxed** (`workspace-write` stays in effect). That is the review-skip analogue
  of Claude `permissions.allow`, not the OS-sandbox analogue of `excludedCommands`. Full bypass
  requires the separate `--dangerously-bypass-approvals-and-sandbox` flag, which CI Codex no longer
  uses as of jonathanong/filaments PR #7871.

A Claude `excludedCommands` entry and a Codex `prefix_rule` are **not equivalent**. The former
removes OS containment; the latter only skips a confirmation for a narrow prefix while
`workspace-write` remains active. Review-skip breadth need not match `excludedCommands`: Claude
still unsandboxes `git *` / `gh *`, while Codex no longer pre-approves `git rebase` / `stash` /
`cherry-pick` or `gh run` / `api` / `workflow`. Grok has no command-prefix file; it reuses
`.claude/settings.json` allow/deny via Claude-compat (see
[Agent Harness Parity](agent-harness-parity.md)). Two-token Codex `["gh","pr"]` remains
pre-approved (`close` / `lock` / `create` without `--draft` included); merge stays hook-gated.
Two-token `["git","branch"]` also remains, including local create and `git branch -D`. Those
leftovers are intentional, not Claude allow parity.

## Why each excluded family is load-bearing

| Command                                                                                                                                         | Why it needs the OS-sandbox bypass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gh *`                                                                                                                                          | `gh`'s auth token lives in `~/.config/gh/hosts.yml`, which is outside the sandbox's filesystem read scope, and no `GH_TOKEN`/`GITHUB_TOKEN` env var is set locally as a fallback. A sandboxed `gh` call cannot authenticate at all — not even `gh pr view`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docker *`                                                                                                                                      | Needs the Docker daemon socket and container-volume writes for local services (`valkey`, `otel`) launched by `./dev/*` scripts — both outside what the OS sandbox's write-allow list covers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm exec *` / `pnpm run *` / `pnpm --dir *` / `pnpm install` / `pnpm test`                                                                    | The local dev loop (unit/integration tests against local Postgres/Valkey, `next build`, Playwright) needs broad filesystem writes and network reach. Sandboxing it would break the day-to-day dev loop for marginal benefit — see the CI-containment argument below for why the actual risk this issue names is handled elsewhere. `pnpm install`/`pnpm test` are pre-approved on the Codex side too (`.codex/rules/default.rules`); this closes the corresponding Claude gap so both agents get the same coverage for the same family. `pnpm --filter *` and `pnpm dlx *` are deliberately **not** in this list: `excludedCommands` only supports a trailing wildcard, so a `pnpm --filter <pkg>` entry can't stop at a safe subcommand — it would also unsandbox `pnpm --filter <pkg> dlx <bin>` and `pnpm --filter <pkg> add <dep>`, the same arbitrary-registry-execution risk the `npx` row below explains for `dlx`. Both stay pre-approved-but-sandboxed on Codex only. |
| `npx pr-shepherd *` / `pr-shepherd *` / `npx vitest *` / `npx oxlint *` / `npx oxfmt *` / `npx no-mistakes *` / `no-mistakes` / `no-mistakes *` | Same tools and same needs as `pnpm exec *` above, just invoked via `npx` (or, for `pr-shepherd`, sometimes the bare binary once it's on `PATH`) instead — `pr-shepherd` in particular is driven this way (not `pnpm exec`) per its own skill convention. Unlike `pnpm exec`, a stale or missing local install lets `npx <tool>` silently fetch and run that package name from the registry instead of failing; listing exact tool names (not a blanket `npx *`) bounds which package that fallback can ever resolve to. The same reasoning excludes `pnpm dlx *` from the pnpm row above: like a blanket `npx *`, it lets an arbitrary registry package execute, so it stays OS-sandboxed even where Codex pre-approves it.                                                                                                                                                                                                                                                    |
| `node dev/pr-description.mts *` / `node dev/plan-issue.mts *`                                                                                   | Both scripts `execFile('gh', …)`/`execFile('git', …)` directly to open/update PRs and validate issues, which needs the same `~/.config/gh/hosts.yml` credential read as the `gh *` row above — a sandboxed child process can't inherit that read scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ps aux` / `ps aux *`                                                                                                                           | Process-table introspection (used to check for stray dev-server/background processes) reads `/proc`-equivalent OS state outside the sandbox's filesystem-scoped read allowlist; a sandboxed `ps aux` fails with a genuine `operation not permitted: ps`, confirmed in `dev/sandbox-command-audit/__tests__/claude-extract-failures.part-2.test.mts` (the sampled invocation was `ps aux` piped into `grep`). Both the bare and wildcard forms are listed so a plain `ps aux` and an argument-bearing `ps aux --sort=-%mem` are each covered.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Mutating/network `git`                                                                                                                          | In a worktree, `commit`/`rebase`/`push`/`stash` write to the **shared** `.git/objects`/`.git/worktrees` store outside the worktree root — not in `filesystem.allowWrite`. `fetch`/`push`/`clone` also need the same credentials as `gh`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Why read-only git is deliberately left excluded too

The one family that _could_ theoretically stay OS-sandboxed is read-only git — `git log`, `git
diff`, `git show`, `git status`, `git rev-parse`, `git rev-list`, `git merge-base`. It was
investigated and rejected for #7669, for three reasons:

1. **Marginal security value.** These subcommands don't execute package code. The only code-exec
   vector through git itself is a malicious `.gitattributes`/git-config filter/hook on _untrusted
   repo content_ — a concern for CI running on untrusted PR input, which is already contained for
   Claude (next section). Locally, the repo content is trusted.
2. **Fragile to implement.** `excludedCommands` is an _exclude_-allowlist: keeping only read-only
   git sandboxed means enumerating every mutating/network git subcommand instead
   (`commit`/`push`/`fetch`/`checkout`/`merge`/`rebase`/`cherry-pick`/`stash`/`add`/`reset`/
   `restore`/`clean`/`tag`/`worktree`/`gc`/`reflog`/…). Missing one silently drops it into the
   sandbox, where it can fail unexpectedly (e.g. a write to the shared `.git/objects` store outside
   the worktree).
3. **Reintroduces E2BIG friction.** The sandbox profile grows with every registered git worktree
   (each contributes deny-paths). Once large enough, even read-only commands hit the OS `E2BIG`
   argument-list limit and are forced to escalate anyway — see
   [sandbox-audit.md](../../.agents/skills/retrospective/sandbox-audit.md#why-frequency-isnt-the-signal).
   Blanket `git *` avoids this entirely today; sandboxing read-only git would reintroduce it as the
   dominant escalation driver the audit tool already tracks.

Net: narrower git benefits almost nothing here and costs real reliability. `git *` stays excluded.

## Additional workspace-write cache and state roots (Grok, Codex, Cursor)

Claude unsandboxes `pnpm exec *` and bare `no-mistakes`. Grok, Codex, and Cursor cannot unsandbox
one command: the sandbox is process-wide `workspace-write`. Their extra writable roots therefore
include the directories those tools actually write, matching across `.codex/config.toml`,
`.grok/sandbox.toml`, `.cursor/sandbox.json`, and Claude `sandbox.filesystem.allowWrite`:

Claude's OS sandbox already writes the project root. `filesystem.allowWrite` is only needed for
additional paths outside that root; in-project build and state output needs no separate grant.
Claude also grants `~/.local/state/mise`, because mise records the repo's `.mise.toml` there on
every shell invocation. Claude grants `/tmp` together with `/private/tmp`, as it does `/var/folders`
with `/private/var/folders`: macOS resolves `/tmp` to `/private/tmp` and the sandbox checks the
resolved path, so `/tmp` alone grants nothing there. pnpm 12 keeps its store operation lock in
`/tmp/pnpm-store-operation-locks-<uid>`, so without the `/private` spelling a sandboxed `pnpm exec`
(one piped into `tail`, for example) fails with `Failed to open the store operation lock`. Claude's `sandbox.network.allowedDomains` adds `registry.npmjs.org` and
`github.com` for commands that stay sandboxed, such as package metadata lookups or a compound
command that does not match an `excludedCommands` pattern. Direct `git *` and `gh *` commands
already run outside the sandbox and do not depend on this list.

- `~/Library/Caches/no-mistakes` — no-mistakes `invocation.lock` on macOS (`ProjectDirs`)
- `~/.cache/no-mistakes` — no-mistakes lock when Linux `XDG_RUNTIME_DIR` is unset
- `~/Library/Caches/pnpm` and `~/.cache/pnpm` — pnpm 11 metadata cache
- `~/.pnpm-state` and `~/.local/state/pnpm` — pnpm state dir

The SQLite error `unable to open database file` comes from pnpm's store `{storeDir}/v11/index.db`
(already under `~/Library/pnpm` / `~/.local/share/pnpm`), not from oxfmt (no persistent cache) and
not from no-mistakes (file lock, not SQLite). Concurrent `pnpm exec` under workspace-write still
shares that WAL database, so the supported contract is serial `pnpm exec`, or `node_modules/.bin/<tool>`
for parallelism. Do not grant all of `~/Library/Caches`. Linux `$XDG_RUNTIME_DIR/no-mistakes` is a
residual if that env is set; do not grant `/run/user` (formerly filed as jonathanong/filaments#9814).

[`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) requires the three
workspace-write lists to stay equal and every Codex writable root to appear in Claude `allowWrite`.

## Claude review-skip for dev/ commands

Claude `permissions.allow` pre-approves every `dev/` entrypoint with two blanket rules,
`Bash(./dev/*)` and `Bash(node dev/*)`, instead of one entry per script. A `Bash(...)` rule matches
the whole command text and `*` matches any text, so a new `dev/` script skips the permission prompt
without a settings change. Grok reuses these allow/deny strings through Claude-compat.

Every `dev/` command in `sandbox.excludedCommands` also keeps a narrow allow entry with the same
text, such as `Bash(./dev/reset-worktree)` and `Bash(./dev/reset-worktree *)`. Those scripts run
outside the OS sandbox, and auto mode may drop the blanket rules (below). Claude Code documents
that auto mode keeps narrow rules, so these entries keep the scripts out of the classifier either
way, as their per-script entries did before the blanket rules existed.

Auto-mode behavior is unverified. On entering auto mode, Claude Code drops "broad allow rules that
grant arbitrary code execution" and gives examples: blanket `Bash(*)`, wildcarded interpreters like
`Bash(python*)`, package-manager run commands, and `Agent` / `Monitor` rules
([permission modes](https://code.claude.com/docs/en/permission-modes)). Neither `dev/` rule matches
a listed example, but both can run arbitrary code: auto mode auto-approves file edits in the working
directory, so an agent can write a `dev/` file and then run it. The docs do not say whether Claude
Code drops blanket script-path rules like these. A live auto-mode session ran sandboxed and
unsandboxed `dev/` commands without a prompt but could not tell what approved them: Claude Code
reports classifier denials, not what approved a command. That session's user settings also had
`sandbox.autoAllowBashIfSandboxed` on and listed `./dev/` tooling as routine in
`autoMode.environment`, so every run would look the same whichever path approved it. Since approvals
are not reported, neither the session UI nor its transcript can settle it; that takes a Claude Code
source that records which path approved a command, or docs that say which rules auto mode keeps. If
Claude Code keeps the blanket rules, `dev/` commands skip the classifier as well as the prompt. If
it drops them, other `dev/` commands go to the classifier, and the unsandboxed scripts rely on their
narrow entries, which the docs say auto mode keeps.

This is review-skip only. OS escalation stays per-script: a `dev/` command that must leave the OS
sandbox still needs its own `sandbox.excludedCommands` pair, the matching narrow allow pair, and a
Codex `prefix_rule` (next section). A `dev/` script without those entries runs pre-approved but
OS-sandboxed.

Two deny rules, `Bash(./dev*/../*)` and `Bash(node dev*/../*)`, refuse the plain spelling of a path
that climbs out of `dev/`, such as `./dev/../bin/sh`. They are a guardrail, not a boundary: they
match the literal `/../`, and shell quoting or escaping (`./dev/".."/bin/sh`) can spell the same path
without it. That reaches nothing the accepted risk below does not already allow, since an agent can
write a `dev/` file that runs anything. Deny beats allow and refuses the command outright; they are
deny rather than ask because Grok reuses the strings and its handling of ask is not documented. The
rules match anywhere in the command text, so a `dev/` command with `/../` in an argument
(`./dev/audit-rename web/../old new`) is refused too; pass that path without `..`.

Accepted risk: the rules trust whatever is under `dev/` when the command runs, not only reviewed
scripts. An agent can create or edit a `dev/` file and run it without review of the run; in auto
mode the edit is auto-approved too. The PreToolUse policy
hook, a guardrail rather than a boundary ([Hook threat model](#hook-threat-model)), blocks edits to
its own hook code and the modules those hooks import, but nothing else under `dev/`.
`sandbox.allowUnsandboxedCommands` is unset, so a command that fails under the sandbox can be
retried outside it; that retry goes through the regular permission flow, where these allow rules
can approve it too. An ask rule for
`Bash(dangerouslyDisableSandbox:true)` would close that, but it cannot be scoped to `dev/`, so it
would prompt on every unsandboxed retry, including `git push` and `gh`.

[`dev/claude-settings-dev-allow.test.mts`](../../dev/claude-settings-dev-allow.test.mts) requires
the `dev/` allow rules to be exactly the two blanket rules plus one narrow entry per `dev/` command
in `sandbox.excludedCommands`, and checks representative commands against the allow and deny rules.

## Three-surface consistency when the allowlist does change

Adding a new **OS** escalation entry (for a _different_ command than the ones above) means updating
three surfaces together:

- `sandbox.excludedCommands` in `.claude/settings.json`
- `permissions.allow` in `.claude/settings.json` (the matching `Bash(...)` entry, `./dev/` and
  `node dev/` commands included; see [Claude review-skip for dev/ commands](#claude-review-skip-for-dev-commands))
- a matching `prefix_rule(pattern=[...], decision="allow")` in `.codex/rules/default.rules`

Review-skip breadth is a separate decision from OS escalation. Do not add a Codex `prefix_rule` or
Claude `permissions.allow` entry for `git rebase` / `stash` / `cherry-pick` or `gh run` / `api` /
`workflow` just to "restore" three-surface match; those families stay out of both review-skip
lists.

[`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) enforces
narrowness (it fails on a bare `git`/`gh`/`rtk`/`npx` prefix), requires the remaining
git/gh prefixes, forbids the six review-bypass families in `.codex/rules/default.rules`,
requires Codex `writable_roots` to be a subset of Claude `sandbox.filesystem.allowWrite`, and
requires every Claude `/tmp` or `/var` write root to be granted under its `/private` spelling too. See
[sandbox-audit.md](../../.agents/skills/retrospective/sandbox-audit.md#decision-criteria) for the
full decision criteria on when an escalation is a genuine bypass candidate worth adding.

## See also

- [Sandbox & Permission Audit](../../.agents/skills/retrospective/sandbox-audit.md) — the
  retrospective tool that surfaces escalation candidates and the E2BIG root cause referenced above.
- [Merge Authority](merge-authority.md) — the other half of the containment model: the PreToolUse
  hook's semantic gating, unaffected by sandbox exclusion.
- [`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) — the three-surface
  consistency and narrowness guard.
- [`dev/claude-settings-dev-allow.test.mts`](../../dev/claude-settings-dev-allow.test.mts) — the
  `dev/` allow (blanket plus narrow unsandboxed) and `/../` deny guard.
- [Agent Harness Parity](agent-harness-parity.md) — Claude vs Codex vs Grok vs Cursor sandbox and hook reuse.
- [`.cursor/README.md`](../../.cursor/README.md) — Cursor CLI sandbox, hooks, and worktree setup.
