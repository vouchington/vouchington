Review the project agent integration for Claude, Codex, Grok, and Cursor for staleness, breadth drift, and ownership drift. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Ownership comes first. Host runtime policy (sandbox mode and roots, network, credential env deny
  list, command exclusions and generic read-only allows, approval policy, models, effort, status
  line, plugins, marketplaces, MCP servers) belongs to
  [vouchington-machines](https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md)
  and is written into user-level config. This checkout owns only project policy: hooks, semantic
  deny rules, narrow project command allows, `.codex/rules/default.rules`, worktree setup, and
  `sandbox.excludedCommands` for its own `dev/` scripts. Do not restore any other project sandbox
  key (writable roots, network, credentials, a generic command exclusion), `.cursor/sandbox.json`, `.grok/sandbox.toml`, a Codex
  `[sandbox*]` table or `model` / `approval_policy` keys, `enabledPlugins`, an MCP registration, a
  generic preapproval list, or a broad host path. The
  [ownership guard](../../../dev/agent-sandbox-config.test.mts) enforces this; do not re-propose its
  assertions. Read [agent-sandbox.md](../../development/agent-sandbox.md) and
  [agent-harness-parity.md](../../development/agent-harness-parity.md) before proposing a change.
- Editable surfaces. `.codex/rules/`, `.codex/config.toml`, `.cursor/*.json`, and
  `dev/codex-hooks/**` are hard-blocked from `Edit`/`Write`/`apply_patch` in the automation context
  this prompt runs in (`PROTECTED_HOOK_DIR_PREFIXES` and `PROTECTED_HOOK_EXACT_FILES` in
  `dev/codex-hooks/policy/protected-hook-paths.mts`, the #8009 hook self-mutation gap; interactive
  sessions are unaffected). Pick the shippable change from `.claude/settings.json` or the docs. This
  prompt carries no `<!-- harness-scheduled-completion: issue -->` marker, so `scheduled-prompts.yml`
  dispatches it in `pr`-completion mode (`publish-contract: scheduled`). When the only genuine
  improvement requires a protected path, stop and report the finding, per
  [scheduled-prompt.md](../automation/scheduled-prompt.md)'s "If no independently mergeable change
  is confidently ready, stop and report why."; a human reads that report and files the follow-up.
  Hooks catch cooperative-agent mistakes and are not a security boundary
  ([hook instructions](../../../dev/codex-hooks/AGENTS.md)). Keep Claude compatibility as the sole
  Cursor and Grok hook source.
- Stay static-config-driven. Reconciling policy against real observed escalations needs local
  session transcripts read by `node dev/sandbox-command-audit.mts`
  ([sandbox-audit.md](../../../.agents/skills/retrospective/sandbox-audit.md)), which a scheduled
  Harness session cannot reach. Scope this rotation to what a repo checkout alone can verify:
  staleness (an entry naming a script, path, or tool no longer in the repo), breadth drift against
  the documented narrowness rule, doc-vs-config drift in `agent-sandbox.md`, and missing guard
  coverage. Treat `sandbox-audit.md` as the complementary human-run half; it reads the machine
  settings with `--settings-path ~/.claude/settings.json`. Frequency alone never authorizes a bypass.
  Never paste raw commands or credentials into public issues.
- Declare boundaries before proposing a change: `supply-chain-security.md` owns CI/CD least
  privilege, not this prompt. `agent-skill-docs.md` owns comparing `.codex/agents/*.toml` model,
  reasoning-effort, and sandbox settings against the agent-workflow routing table; do not re-own
  per-agent `.toml` drift here. `security.md` is application-layer only. The credential deny list
  and its inventory live in vouchington-machines
  ([pointer](../../development/reference-agent-sandbox-credential-deny-list.md)); do not rebuild a
  copy in this checkout.
- Documented decisions that are not targets. Claude `Bash(./dev/*)` / `Bash(node dev/*)` and their
  `/../` deny rules are a review-skip decision
  ([Claude review-skip for dev/ commands](../../development/agent-sandbox.md#claude-review-skip-for-dev-commands),
  guarded by `dev/claude-settings-dev-allow.test.mts`). The only per-script `dev/` allow entries are
  the narrow twins of `dev/` entries in `sandbox.excludedCommands`; do not re-propose per-script
  entries for other `dev/` scripts, and do not read the blanket rules' breadth as a reason to widen
  `sandbox.excludedCommands`.
  Claude's rebase lifecycle rules (`git rebase --continue` / `--skip` / `--abort` and the
  `git push --force-with-lease=*` lease push) are a separate documented decision that cannot start a
  rebase
  ([Claude review-skip for the rebase lifecycle](../../development/agent-sandbox.md#claude-review-skip-for-the-rebase-lifecycle)).
  Do not add `git rebase` / `stash` / `cherry-pick` or `gh run` / `api` / `workflow` to a project
  allow list, and do not widen Claude `Bash(gh pr *)`. Codex still having two-token `["gh","pr"]` is
  an intentional leftover.
- Concrete targets to check first. Every `sandbox.excludedCommands` entry, every
  `.codex/rules/default.rules` prefix, and every narrow Claude `permissions.allow` entry must name a script, path, or tool that still exists (package-script
  commands, `./ci/lint-links.sh`, `dev/` scripts); a Codex allow is also an OS-sandbox bypass for
  that command, so flag one whose breadth no longer matches the rationale in
  [agent-sandbox.md](../../development/agent-sandbox.md#claude-and-codex-sandbox-semantics-are-different-not-parallel).
  Check `agent-sandbox.md` and `agent-harness-parity.md` for a claim that no longer matches
  `.claude/settings.json`, `.codex/`, `.cursor/`, or the machine contract.
- Do not propose broadening a sandbox boundary to work around a specific command failure; narrow the
  command or fix the underlying script instead, per the narrowness rule `agent-sandbox.md`
  documents.
