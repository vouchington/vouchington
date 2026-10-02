# Agent sandbox and project policy

Host runtime policy for Claude, Codex, Cursor, and Grok does not live in this checkout. Sandbox
mode and roots, network access, the credential env deny list, generic command exclusions and
read-only allows, approval policy, models, effort, and status line belong to
[vouchington-machines](https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md).
On every machine, run that repository's `./configure-agents.sh --dry-run`, then
`./configure-agents.sh`. Run `./diagnose-agents.sh` to diagnose sandbox availability or drift.
This checkout owns the project hooks, semantic denies, narrow project command allows, the
exclusions for its own checked-in scripts, and MCP/plugin integration.
[`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) guards that boundary.

Why project config must not choose the host sandbox: Claude Code cloud sessions (claude.ai/code)
exit at startup when the checked-in `.claude/settings.json` sets `sandbox.failIfUnavailable`. A
checked-in `sandbox.enabled` likewise forces a sandbox the host may not provide. Project settings
therefore omit both, along with `sandbox.filesystem`, `sandbox.network`, `sandbox.credentials`,
`permissions.defaultMode`, `effortLevel`, `advisorModel`, and `statusLine`. The Codex project
config omits `model`, `sandbox_mode`, `approval_policy`, `approvals_reviewer`, and every
`[sandbox*]` table. Cursor and Grok keep no project sandbox profile.

Auto Harness execution profiles run agents under a dedicated `HOME`, so they never read a
developer's user config. Run `./configure-agents.sh --home <profile home>` for each profile home, or
that profile runs without the machine policy.

## Two independent containment layers

Every agent tool call passes through two layers that do not overlap:

1. **The PreToolUse policy hook** (`dev/codex-hooks/pre-tool-use.mts` → `policy.mts`): semantic
   gating of force-push, `--amend`, dev-server launches, hook self-mutation, and merge authority
   (see [Merge Authority](merge-authority.md)). It is wired identically for Claude
   (`.claude/settings.json`) and Codex (`.codex/config.toml`), and it fires whether or not the
   command is OS-sandboxed.
2. **The machine's OS sandbox**: filesystem, credential, and network scoping at the OS level. The
   machine policy configures it, and a project exclusion only lifts it for one command. An excluded
   command still passes through the hook above.

Project configuration neither requires a particular host sandbox nor adds a command bypass for a
tool the machine policy does not already trust. Narrowing a project exclusion affects layer 2 only.

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

## Sandbox credential deny list

Credential filtering belongs to the machine policy (see the contract linked above). This checkout
carries no credential list. `dev/check-blackboard.mts` stays in the project exclusions for that
reason: a sandboxed probe cannot tell a withheld `AGENT_BLACKBOARD_TOKEN` from an outage
([Advisory availability probe](agent-blackboard.md#advisory-availability-probe)). Codex
`[mcp_servers.agent-blackboard].env_vars` forwards `AGENT_BLACKBOARD_URL` and
`AGENT_BLACKBOARD_TOKEN` into the MCP server as a separate control. The
[credential deny list reference](reference-agent-sandbox-credential-deny-list.md) points to the
machine inventory.

## Project sandbox exclusions

`sandbox.excludedCommands` in [`.claude/settings.json`](../../.claude/settings.json) names only this
repository's checked-in scripts: each `./dev/` and `node dev/…mts` command that must leave the OS
sandbox, as an exact entry plus a ` *` entry. Claude merges `sandbox` arrays across user and project
settings, so these entries add to the machine's generic exclusions (`git *`, `gh *`, `pnpm exec *`,
and so on). The scripts call `gh`, `git`, `docker`, and `tmux` directly and need the host's
credentials and shared `.git` store. Without a machine `sandbox.enabled`, as in a cloud session, the
entries do nothing.

Codex `prefix_rule` allows in `.codex/rules/default.rules` run the matched command outside the Codex
sandbox without a prompt. The file lists only `./dev/` and `node dev/…mts` prefixes, and each must be
covered by a trailing-wildcard Claude project exclusion. `git rebase`, `git stash`,
`git cherry-pick`, `gh run`, `gh api`, and `gh workflow` stay out of every project allow list except
the Claude [rebase lifecycle](#claude-review-skip-for-the-rebase-lifecycle) rules.

## Claude review-skip for dev/ commands

Claude `permissions.allow` pre-approves every `dev/` entrypoint with two blanket rules,
`Bash(./dev/*)` and `Bash(node dev/*)`, instead of one entry per script. A `Bash(...)` rule matches
the whole command text and `*` matches any text, so a new `dev/` script skips the permission prompt
without a settings change. Grok reuses these allow/deny strings through Claude-compat.

Every `dev/` command in `sandbox.excludedCommands` also keeps a narrow allow entry with the same
text, such as `Bash(./dev/reset-worktree)` and `Bash(./dev/reset-worktree *)`. Those scripts run
outside the OS sandbox, and auto mode may drop the blanket rules. Claude Code documents that auto
mode keeps narrow rules, so these entries keep the scripts out of the classifier either way.

Whether auto mode keeps the blanket rules is unverified. On entering auto mode, Claude Code drops
"broad allow rules that grant arbitrary code execution", such as blanket `Bash(*)`, wildcarded
interpreters, package-manager run commands, and `Agent` / `Monitor` rules
([permission modes](https://code.claude.com/docs/en/permission-modes)). Neither `dev/` rule matches
a listed example, but both can run arbitrary code, because an agent can write a `dev/` file and run
it. Claude Code reports classifier denials, not what approved a command, so no session can settle
it. If it keeps the blanket rules, `dev/` commands skip the classifier as well as the prompt. If it
drops them, other `dev/` commands go to the classifier and the unsandboxed scripts rely on their
narrow entries.

This is review-skip only. OS escalation stays per-script: a `dev/` command that must leave the OS
sandbox still needs its own `sandbox.excludedCommands` pair, the matching narrow allow pair, and a
Codex `prefix_rule`. A `dev/` script without those entries runs pre-approved but OS-sandboxed on
Claude; on Codex it follows the ordinary sandboxed path.

Two deny rules, `Bash(./dev*/../*)` and `Bash(node dev*/../*)`, refuse the plain spelling of a path
that climbs out of `dev/`, such as `./dev/../bin/sh`. They are a guardrail, not a boundary: they
match the literal `/../`, and shell quoting (`./dev/".."/bin/sh`) can spell the same path without
it. That reaches nothing the accepted risk below does not already allow, since an agent can write a
`dev/` file that runs anything. Deny beats allow and refuses the command outright; they are deny
rather than ask because Grok reuses the strings and its handling of ask is not documented. The rules
match anywhere in the command text, so a `dev/` command with `/../` in an argument
(`./dev/audit-rename web/../old new`) is refused too; pass that path without `..`.

Accepted risk: the rules trust whatever is under `dev/` when the command runs, not only reviewed
scripts. An agent can create or edit a `dev/` file and run it without review of the run; in auto
mode the edit is auto-approved too. The PreToolUse hook, a guardrail rather than a boundary
([Hook threat model](#hook-threat-model)), blocks edits to its own hook code and the modules those
hooks import, but nothing else under `dev/`.

[`dev/claude-settings-dev-allow.test.mts`](../../dev/claude-settings-dev-allow.test.mts) requires
the `dev/` allow rules to be exactly the two blanket rules plus one narrow entry per `dev/` command
in `sandbox.excludedCommands`, and checks representative commands against the allow and deny rules.

## Claude review-skip for the rebase lifecycle

Claude `permissions.allow` pre-approves the commands the
[git workflow](../../.agents/skills/agent-workflow/git-and-prs.md) runs once a rebase has started:
`git rebase --continue` (also as `GIT_EDITOR=true git rebase --continue`), `git rebase --skip`,
`git rebase --abort`, and the lease push `git push --force-with-lease=*`. A command that matches an
allow rule is approved before the auto-mode classifier runs
([permission modes](https://code.claude.com/docs/en/permission-modes)). Without these rules, the
classifier refused `git rebase --skip` and lease pushes even though the workflow requires them. None
of them can start a rebase. `git rebase <upstream>`, `-i`, and `--onto` stay on review, and starting
a rebase goes through `./dev/rebase-onto-main`.

Claude Code matching limits these rules
([permissions](https://code.claude.com/docs/en/permissions)):

- Every subcommand of a compound command must match a rule, and a `cd` into another directory is
  never read-only. `cd <other worktree> && git rebase --skip` and `git -C <dir> …` both go to
  review. Run these commands bare from the session's own worktree. A Claude session that may rebase
  works in a harness worktree under `.claude/worktrees/`, not in a hand-made tmpdir worktree.
- An allow rule does not match past a leading environment assignment unless Claude Code treats that
  variable as known-safe. `GIT_EDITOR` is not documented either way, so the `GIT_EDITOR=true` form
  has its own literal rule. No session has yet confirmed that the literal rule matches.
- `*` matches any text, so the lease rule also matches a lease push that adds `--force`, `-f`, or a
  `+` refspec. The PreToolUse hook and `.husky/pre-push` block those. They are not deny rules
  ([How Grok reuses Claude rules](agent-harness-parity.md#how-grok-reuses-claude-rules)).
- Prose `autoMode` entries are read only from user settings, managed settings, and `--settings`,
  not from `.claude/settings.json`. The machine policy owns them; a classifier exception for any
  other command shape goes in the machine config.

Accepted risk: the machine policy excludes `git *` from the OS sandbox, and the lease rule's `*`
admits any further arguments. A lease push with `--receive-pack=` or `--exec=`, or one to a local
repository whose hooks the agent wrote, can run arbitrary code without review. That is the same
class of risk the [dev/ rules](#claude-review-skip-for-dev-commands) accept, and partial deny rules
would not close it. Grok reuses these strings with prefix matching. Codex keeps them on its ordinary
review path, because `.codex/rules/default.rules` has no `git rebase` or `git push` prefix.

## Narrow project command allows

Beyond the `dev/` and rebase rules, `permissions.allow` keeps only exact Bash entries for this
repository's own package scripts (for example `pnpm run typecheck`, `pnpm run -s typecheck:backend`,
`pnpm run no-mistakes`, and `pnpm run oxfmt:check`), `./ci/lint-links.sh`, and read-only MCP tools.
Generic read-only allows (`git log`, `rg`, `cat`, `aws … describe-*`) are machine policy. Every
`permissions.deny` rule stays in the project, including the home-directory credential paths.

## Changing a project exclusion

Adding a `dev/` script that must leave the OS sandbox means updating three surfaces together:
`sandbox.excludedCommands` and the matching narrow `permissions.allow` pair in
`.claude/settings.json`, and a `prefix_rule(pattern=[...], decision="allow")` in
`.codex/rules/default.rules`. A generic tool (`git`, `gh`, `docker`, `pnpm`) belongs in
vouchington-machines instead. The guard requires every exclusion to name a `./dev/` or `node dev/`
command, rejects host keys in the project files, and requires each Codex allow to be covered by a
project exclusion. See [sandbox-audit.md](../../.agents/skills/retrospective/sandbox-audit.md) for
when an escalation is a genuine bypass candidate; it reads the machine settings with
`--settings-path ~/.claude/settings.json`.

## Checkout of sandbox-protected paths

Claude's sandbox denies writes to the files it loads configuration from, inside an otherwise
writable worktree. Cursor denies `.claude/*.json`, `.cursor/*.json`, and a few other paths the
same way, and sets `CURSOR_SANDBOX` on sandboxed children. A sandboxed `git rebase`,
`git reset --hard`, or `git checkout` can replace ordinary files and then die with
`unable to unlink old '.claude/settings.json'`. `HEAD` stays unchanged and the worktree is dirty.
The commits are intact. `git reset --hard` restores the tracked files. Run the same git command
again outside the sandbox: a plain `git *` command is excluded by the machine policy, and
`./dev/rebase-onto-main` is a project exclusion. A command shape Claude keeps sandboxed (`cd`, a
substitution, a redirection, or a chain that is not entirely excluded) is the one that can die
halfway. Retry that command unsandboxed.

This is not the Edit/Write list in
[`dev/codex-hooks/policy/protected-hook-paths.mts`](../../dev/codex-hooks/policy/protected-hook-paths.mts).
The PreToolUse hook does not refuse a checkout, rebase, merge, reset, cherry-pick, or stash
because a settings file would change. `./dev/rebase-onto-main` fetches `origin/main` and rebases.
`./dev/rebase-onto-main --stack` runs `gh stack rebase`. `./dev/reset-worktree` fetches and
hard-resets. `git rebase --abort` stays allowed so a dirty rebase can still be left.

## Feedback evidence boundary

Report consequential tool and sandbox outcomes through the supported Blackboard writer before
issue filing. Record the command boundary, sanitized diagnostic, work outcome, and evidence coverage
separately. A refusal, missing credential, network error, Git write denial, and `E2BIG` require
different remedies; frequency alone does not justify broadening bypasses. Automatic hooks remain
local-only. agent-blackboard stays separate from auto-harness. See
[the delivery contract](agent-blackboard.md#interactive-pending-delivery).

## See also

- [Agent Harness Parity](agent-harness-parity.md): Claude, Codex, Grok, Cursor sandbox and hook reuse.
- [Merge Authority](merge-authority.md): the PreToolUse hook's semantic gating, unaffected by sandbox
  exclusion.
- [Sandbox & Permission Audit](../../.agents/skills/retrospective/sandbox-audit.md): the retrospective
  tool that surfaces escalation candidates.
- [Sandbox credential deny list](reference-agent-sandbox-credential-deny-list.md): where the
  inventory moved.
- [`docs/development/harnesses/cursor.md`](harnesses/cursor.md): Cursor CLI hooks and worktree setup.
- Guards: [`dev/agent-sandbox-config.test.mts`](../../dev/agent-sandbox-config.test.mts) and
  [`dev/claude-settings-dev-allow.test.mts`](../../dev/claude-settings-dev-allow.test.mts).
