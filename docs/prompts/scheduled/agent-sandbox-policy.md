Review the agent sandbox and permission configuration across Claude, Codex, Grok, and Cursor for staleness, breadth drift, and cross-harness parity gaps. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- This prompt owns `.claude/settings.json` (`permissions.allow` / `deny` / `defaultMode`,
  `sandbox.excludedCommands`, `sandbox.filesystem.allowWrite`, `sandbox.credentials.envVars`),
  `.codex/rules/default.rules`, `.codex/config.toml`, `.grok/sandbox.toml`, `.cursor/sandbox.json`,
  `.cursor/cli.json`, `.cursor/permissions.json`, and
  `dev/codex-hooks/policy.mts` + `dev/codex-hooks/policy/` block-list additions for audit
  purposes — staleness, breadth drift, and doc-vs-config parity across all of them are in scope to
  find and report. But `.codex/rules/`, `.codex/config.toml`, and `dev/codex-hooks/**` are
  themselves hard-blocked from `Edit`/`Write`/`apply_patch` in exactly the automation context this
  scheduled prompt runs in (the `hookPayloadReferencesProtectedHookPath` check in
  `dev/codex-hooks/policy.mts`, paths named by `PROTECTED_HOOK_DIR_PREFIXES` and
  `PROTECTED_HOOK_EXACT_FILES` in `dev/codex-hooks/policy/protected-hook-paths.mts` — the #8009
  hook self-mutation gap;
  interactive sessions are unaffected). Pick the shippable change from an editable surface —
  `.claude/settings.json`, `.grok/sandbox.toml`, or the docs below. This prompt carries no
  `<!-- harness-scheduled-completion: issue -->` marker, so `scheduled-prompts.yml` dispatches it in
  `pr`-completion mode (`publish-contract: scheduled`) — a scheduled run has no issue-publication
  path to fall back on. When the only genuine improvement found requires touching a protected path,
  stop and report the finding instead of attempting to file an issue, per
  [scheduled-prompt.md](../automation/scheduled-prompt.md)'s "If no independently mergeable change is
  confidently ready, stop and report why."; a human reads that report and files the follow-up.
  Anchor every change to the two-layer containment
  model (PreToolUse semantic hook vs. OS sandbox) and the cross-harness capability matrix in
  [agent-sandbox.md](../../development/agent-sandbox.md) and
  [agent-harness-parity.md](../../development/agent-harness-parity.md).
- Stay static-config-driven. Reconciling policy against real observed escalations needs local
  session transcripts read by `node dev/sandbox-command-audit.mts`
  ([sandbox-audit.md](../../../.agents/skills/retrospective/sandbox-audit.md)), which a scheduled
  Harness session cannot reach. Scope this rotation to what a repo checkout alone can verify:
  staleness (an entry naming a script, path, or tool no longer in the repo), breadth drift against
  the documented narrowness rule, cross-harness parity gaps, doc-vs-config drift in
  `agent-sandbox.md`, and missing guard coverage. Treat `sandbox-audit.md` as the complementary
  human-run half, not something to duplicate here.
- Declare boundaries before proposing a change: `supply-chain-security.md` owns CI/CD least
  privilege (workflow `permissions`, `GITHUB_TOKEN`, `pull_request_target` / `workflow_run`,
  Dependabot CVE triage) — not this prompt. `agent-skill-docs.md` already owns comparing
  `.codex/agents/*.toml` model, reasoning-effort, and sandbox settings against the agent-workflow
  routing table — do not re-own per-agent `.toml` drift here. `security.md` is application-layer
  only. [`dev/agent-sandbox-config.test.mts`](../../../dev/agent-sandbox-config.test.mts) already
  guards Grok's writable-root parity against Codex, requires the remaining git/gh
  prefixes (`git log`/`fetch`/`show`/`diff`/`status`/`rev-parse`/`merge-base`/`rev-list`/`branch`,
  `gh pr`, `gh issue`) plus the pnpm approval prefixes in `.codex/rules/default.rules` and two
  agent-workflow docs, and **forbids** those six review-bypass families in `.codex/rules/default.rules`
  (`git rebase` / `stash` / `cherry-pick` and `gh run` / `api` / `workflow`) — do not re-propose those presence or absence
  assertions. Do **not** add those six families back to Claude `permissions.allow` or Codex
  `prefix_rule`; absence on both review-skip lists is the intended parity after
  jonathanong/filaments PR #9574 and a related change (formerly
  filed as jonathanong/filaments#9578). Codex still having two-token
  `["gh","pr"]` while Claude allows only `comment` / `ready` / `edit` / `create --draft` is an
  intentional leftover, not a scheduled-prompt target — do not "fix" it by widening Claude
  `Bash(gh pr *)`. Claude `Bash(./dev/*)` / `Bash(node dev/*)` and their `/../` deny rules are a
  documented review-skip decision
  ([Claude review-skip for dev/ commands](../../development/agent-sandbox.md#claude-review-skip-for-dev-commands),
  guarded by `dev/claude-settings-dev-allow.test.mts`). The only per-script `dev/` allow entries
  are the narrow twins of `dev/` entries in `sandbox.excludedCommands`, which that test requires —
  do not re-propose per-script allow entries for other `dev/` scripts, and do not read the blanket
  rules' breadth as a reason to widen `sandbox.excludedCommands`.
- Three concrete, unguarded targets to check first: Codex/Grok/Cursor extra writable roots are
  already required to stay equal, and every Codex `writable_roots` entry must appear in Claude
  `sandbox.filesystem.allowWrite` (formerly filed as jonathanong/filaments#9814).
  Do **not** re-propose that subset gate. Claude may still have extra `allowWrite` roots that
  Codex does not (`web/.next`, `cloudflare-worker/.wrangler/state`). Confirm whether each of
  those Claude-only roots is still justified. [Three-surface consistency when the allowlist does
  change](../../development/agent-sandbox.md#three-surface-consistency-when-the-allowlist-does-change)
  still names command-prefix surfaces (`sandbox.excludedCommands`, `permissions.allow`,
  `.codex/rules/default.rules`) separately from writable-root parity.
- `sandbox.credentials.envVars` (the deny-list of secrets unset before a sandboxed command runs) is
  undocumented outside `.claude/settings.json` itself, aside from one incidental comment in
  `dev/check-blackboard.mts` and an implicit reference at
  [agent-blackboard.md](../../development/agent-blackboard.md). Do not judge an entry's staleness by
  whether the repo itself issues or references that credential — several entries (e.g.
  `CLAUDE_CODE_OAUTH_TOKEN`, `CLOUDSDK_PROXY_PASSWORD`, `GITHUB_PERSONAL_ACCESS_TOKEN`,
  `SONAR_TOKEN`) are ambient secrets a developer's local environment may hold even though nothing in
  the checkout names them; removing the deny entry would expose those credentials to sandboxed
  commands. Only propose dropping an entry when you have positive evidence it is obsolete in the
  supported local dev environments (documented in
  [system-dependencies.md](../../development/system-dependencies.md) or equivalent), not merely the
  absence of a repo reference. Separately, check whether the list belongs in `agent-sandbox.md` or
  `agent-blackboard.md` — whichever is the intended home — as a documented, guarded surface, so a
  future editor doesn't add it only as an inline comment again.
- `dev/agent-sandbox-config.test.mts` verifies the remaining git/gh prefixes and the
  pnpm approval prefixes exist in `codexRules` and in doc text, and forbids the six review-bypass
  families in `.codex/rules/default.rules`. It does not read `claudeSettings.permissions.allow` for those families. Do **not**
  treat that as a prompt to add `git rebase` / `stash` / `cherry-pick` or `gh run` / `api` /
  `workflow` back to Claude allow so the lists match. Claude already dropped them in #9574; Codex
  drops them here. A legitimate remaining target is Claude/Codex drift on families that are
  **supposed** to stay pre-approved (the remaining git/gh prefixes and pnpm prefixes), not restoring
  the six.
- Check `.claude/settings.json`'s `sandbox.excludedCommands` and `.codex/rules/default.rules` for an
  entry naming a script, path, or npx tool invocation that no longer exists in the repo, or that has
  moved and left a stale prefix behind.
- Re-verify the three-surface consistency rule itself still holds for every existing escalation
  entry, but per
  [Claude and Codex sandbox semantics are different, not
  parallel](../../development/agent-sandbox.md#claude-and-codex-sandbox-semantics-are-different-not-parallel),
  do not require identical command-family breadth across all three, and do not require
  `sandbox.excludedCommands` and `permissions.allow` to match each other's breadth even within
  Claude — per
  [Claude and Codex sandbox semantics are different, not
  parallel](../../development/agent-sandbox.md#claude-and-codex-sandbox-semantics-are-different-not-parallel),
  these two Claude-side controls are **independent by design**: `excludedCommands` governs OS
  containment, `permissions.allow` governs only whether a confirmation prompt fires, and a command
  can be excluded-but-prompted or allowed-but-sandboxed. Validate each control against its own
  rationale instead — not by forcing the two to match. For an exclusion, that rationale is the
  load-bearing table in `agent-sandbox.md`; for an allow entry, judge it only against
  repository-verifiable evidence (documented command frequency, an owning skill/doc citing the
  command family, staleness against current repo state), never against day-to-day confirmation
  friction — a scheduled run has no access to the local session transcripts that would show real
  approvals or escalations (see the `sandbox-command-audit.mts` note above), so it cannot
  substantiate a friction-based judgment from its checkout alone. Route confirmation-frequency
  questions to the human-run `sandbox-audit.md` process instead of guessing.
  Across harnesses, a narrower Codex `.codex/rules/default.rules` `prefix_rule` for the same family (e.g.
  broad `git *`/`gh *` excluded on Claude, only specific subcommands prefix-approved on Codex) is
  often intentional: a Claude exclusion removes OS containment entirely, while a Codex prefix rule
  only skips the confirmation prompt and the command stays fully sandboxed. Flag a cross-harness gap
  only when the breadth difference contradicts the documented rationale for that specific command
  family, not merely because the prefixes differ.
- Do not propose broadening a sandbox boundary to work around a specific command failure; narrow the
  command or fix the underlying script instead, per the narrowness rule `agent-sandbox.md` already
  documents.
