# Agent Sandbox And Command Policy

**The rule:** host runtime policy belongs to the user's agent configuration, not to this
repository. That covers the OS sandbox and its on/off choice, writable roots, network allowlist,
credential-variable hiding, command exclusions, approval mode, model and effort defaults, the
status line, plugins, marketplaces, and MCP servers. vouchington-machines writes it into
`~/.claude`, `~/.codex`, `~/.cursor`, and `~/.grok` (`./configure-agents.sh`), and
`./diagnose-agents.sh --repo <worktree>` fails when a project config carries one of those keys
again ([contract](https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md)).
Keeping it out of the checkout lets Claude Code cloud sessions, which have no OS sandbox, start here.

This repository keeps project policy only: the PreToolUse hooks, `permissions.allow` and `deny`,
Codex `prefix_rule`s, worktree setup, and the one sandbox key it must own, `sandbox.excludedCommands`
for its own `dev/` scripts (each as an exact entry plus a ` *` twin). A project permission allow is
not an OS sandbox exemption, but `decision="allow"` prefixes in `.codex/rules/default.rules` do run
outside Codex's sandbox without a prompt, so keep them narrow. `git rebase`, `git stash`,
`git cherry-pick`, `gh run`, `gh api`, and `gh workflow` are deliberately not pre-approved, so
review sees the argv. Harness dispatch is fail-closed.

## Two independent containment layers

Every agent tool call passes through two layers that don't overlap:

1. **The PreToolUse policy hook** (`dev/codex-hooks/`): semantic gating such as force-push,
   `--amend`, dev-server launches, hook self-mutation, and [merge authority](merge-authority.md).
   It fires regardless of whether the command is OS-sandboxed.
2. **The OS sandbox**: filesystem and network scoping owned by the user's agent config, including
   which commands bypass it ([credential deny list](#sandbox-credential-deny-list)). Codex allow
   prefix rules also bypass it.

Narrowing a machine's exclusions only affects layer 2; it adds or removes no semantic gate.

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
[dev/codex-hooks/AGENTS.md](../../dev/codex-hooks/AGENTS.md).

## Claude and Codex sandbox semantics are different, not parallel

- **Claude:** `sandbox.excludedCommands` runs a command _outside_ the OS sandbox;
  `permissions.allow` auto-approves it. These are **independent**.
- **Codex:** `prefix_rule(..., decision="allow")` auto-approves **and** runs outside the OS sandbox.
  `--dangerously-bypass-approvals-and-sandbox` bypasses both for the whole session.

A Codex allow therefore removes OS containment, so Codex pre-approves less than Claude lets
through. Grok has no command-prefix file; it reuses `.claude/settings.json` allow/deny via
Claude-compat (see [Agent Harness Parity](agent-harness-parity.md)). The two-token `["gh","pr"]` and
`["git","branch"]` prefixes remain intentionally; merge stays hook-gated.

## Why generic tools need the OS-sandbox bypass

The machine config decides which commands leave the sandbox. Recorded reasons: `gh` auth lives
outside the sandbox read scope, so a sandboxed `gh` cannot authenticate at all; `docker` needs the
daemon socket; the pnpm dev loop needs broad writes and network; mutating `git` writes the shared
`.git` store outside the worktree. `pnpm --filter`, `pnpm --dir`, `pnpm dlx`, and a blanket `npx *`
belong in no exclusion or Codex allow, because a variable filter precedes the subcommand and `dlx`
or `npx` can execute an arbitrary registry package.

Read-only git was rejected as a separate sandboxed family (#7669): it has marginal security value, an
exclude-allowlist would silently sandbox any mutating subcommand it missed, and the sandbox profile
grows with each registered worktree until even read-only commands hit `E2BIG`. `git *` belongs in the
machine's exclusions as a whole. Concurrent `pnpm exec` shares one WAL database in the pnpm store,
so run it serially, or use `node_modules/.bin/<tool>` for parallelism.

## Sandbox credential deny list

Claude's OS sandbox unsets every name in the user config's `sandbox.credentials.envVars` before a
sandboxed command starts, and Codex's `shell_environment_policy.exclude` hides the same names from
its shell commands. Each Claude entry is `mode` `deny`. A command that bypasses the sandbox still
receives the variables. The `vouchington agent-blackboard session-start` hook runs outside it for
that reason: a sandboxed probe cannot tell a withheld `AGENT_BLACKBOARD_TOKEN` from an outage
([SessionStart availability check](agent-blackboard.md#sessionstart-availability-check)).

The machine-registered `vouchington-tooling` server receives `AGENT_BLACKBOARD_URL` and
`AGENT_BLACKBOARD_TOKEN` through its own registration (Codex `env_vars`), a separate control from
this deny list, so the token stays hidden from sandboxed Claude and Codex shell commands while the server can still use it.
The token is meant for the server; agents journal through it, and never ask for an unsandboxed run
just to obtain the token (see the [blackboard skill](../../.agents/skills/blackboard/SKILL.md)). The exposure differs by harness: an
unsandboxed Claude command still receives the denied variables, Codex hides them from its shell
commands even unsandboxed, and Cursor and OpenCode pass the agent's environment to shell commands,
so a token exported to them is visible to the commands they run.

The list itself belongs to
[vouchington-machines](https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md).
Before removing a name from it, check [system-dependencies.md](system-dependencies.md) and the
Blackboard credential contract: a developer shell can export a credential this checkout never reads.

## Claude review-skip for dev/ commands

Claude `permissions.allow` pre-approves every `dev/` entrypoint with two blanket rules,
`Bash(./dev/*)` and `Bash(node dev/*)`, so a new `dev/` script skips the permission prompt without a
settings change. Grok reuses these strings through Claude-compat. Every `dev/` command in
`sandbox.excludedCommands` also keeps a narrow exact-plus-wildcard allow pair, because auto mode may
drop the blanket rules but keeps narrow ones.

This is review-skip only. OS escalation stays per-script: a `dev/` command that must leave the OS
sandbox needs its own `sandbox.excludedCommands` pair, the matching allow pair, and a Codex
`prefix_rule`. Two deny rules, `Bash(./dev*/../*)` and `Bash(node dev*/../*)`, refuse the plain
spelling of a path that climbs out of `dev/`. They are a guardrail, not a boundary, since quoting
can spell the same path.

Accepted risk: the rules trust whatever is under `dev/` when the command runs. An agent can write a
`dev/` file and run it without review of the run. The PreToolUse hook blocks edits to its own code
only ([Hook threat model](#hook-threat-model)). An ask rule for
`Bash(dangerouslyDisableSandbox:true)` would close the unsandboxed retry path but would prompt on
every retry, including `git push` and `gh`.

[`dev/claude-settings-dev-allow.test.mts`](../../dev/claude-settings-dev-allow.test.mts) pins the
exact allow and deny shapes.

## Claude review-skip for the rebase lifecycle

Claude `permissions.allow` pre-approves the commands the
[git workflow](../../.agents/skills/agent-workflow/git-and-prs.md) runs once a rebase has started:
`git rebase --continue`, `--skip`, `--abort`, and `git push --force-with-lease=*`. Without them the
auto-mode classifier refused commands the workflow requires. None can start a rebase; starting one
goes through `./dev/rebase-onto-main`.

Claude Code matching limits: every subcommand of a compound command must match (so `cd <other
worktree> && git rebase --skip` and `git -C <dir>` go to review; run these bare from the session's
own worktree); an allow does not match past a leading environment assignment, so the
`GIT_EDITOR=true` form has its own literal rule; and `*` also admits a lease push that adds
`--force`, `-f`, or a `+` refspec, which the PreToolUse hook and `.husky/pre-push` block rather than
a deny rule ([How Grok reuses Claude rules](agent-harness-parity.md#how-grok-reuses-claude-rules)).

Accepted risk: `git *` already runs outside the OS sandbox, and a lease push with `--receive-pack=`
or `--exec=` can run arbitrary code without review, the same class the dev/ rules accept.

## Keeping the project allowlists narrow

A generic tool or command family (`git log`, `pnpm exec`, `docker`) leaves the OS sandbox through
the user's agent config, never through a project exclusion. Adding a `dev/` script that must leave
it touches three surfaces: `sandbox.excludedCommands` (exact plus ` *` twin) and the matching
`permissions.allow` pair in `.claude/settings.json`, and a Codex `prefix_rule` only when Codex needs
an unsandboxed no-prompt run. Do not add a Codex or Claude allow for `git rebase` / `stash` /
`cherry-pick` or `gh run` / `api` / `workflow` to "restore" parity; the only exception is the
rebase-lifecycle rules above. `rga` and `tokei` are not pinned, so they are not review-skipped.

[`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) is the ownership and
narrowness guard. See
[sandbox-audit.md](../../.agents/skills/retrospective/sandbox-audit.md#decision-criteria) for when an
escalation is a genuine bypass candidate.

## Checkout of sandbox-protected paths

Claude's sandbox denies writes to the files it loads configuration from, inside an otherwise
writable worktree. Cursor denies `.claude/*.json`, `.cursor/*.json`, and a few other paths the
same way, and sets `CURSOR_SANDBOX` on sandboxed children. `allowWrite` cannot lift those paths.
A sandboxed `git rebase`, `git reset --hard`, or `git checkout` can replace ordinary files and
then die with `unable to unlink old '.claude/settings.json'`. `HEAD` stays unchanged and the
worktree is dirty. The commits are intact. `git reset --hard` restores the tracked files. Run the
same git command again outside the sandbox, through the harness's normal one-command approval
path unless the user's config already excludes `git *` (this project excludes `./dev/rebase-onto-main`). A command shape
Claude keeps sandboxed (`cd`, a substitution, a redirection, or a chain that is not entirely
excluded) is the one that can die halfway. Retry that command unsandboxed.

`git rebase --abort` stays allowed so a dirty rebase can still be left.

## See also

- [Sandbox & Permission Audit](../../.agents/skills/retrospective/sandbox-audit.md)
- [Merge Authority](merge-authority.md) — the PreToolUse hook's semantic gating.
- [Agent Harness Parity](agent-harness-parity.md)
