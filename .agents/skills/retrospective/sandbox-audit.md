## Sandbox & Permission Audit Details

Referenced from [the agent-sandbox scheduled prompt](../../../docs/prompts/scheduled/agent-sandbox-policy.md), which runs `node dev/sandbox-command-audit.mts` and links this doc as the complementary human-run half of the audit.

### Why frequency isn't the signal

It's tempting to rank "most-escalated commands" and add the top ones to the bypass list. Don't. In this repo the dominant driver of escalations is the sandbox profile hitting the OS `E2BIG` argument-list limit — every registered git worktree contributes deny-paths to the profile, and once it's large enough, even read-only commands already covered by the escalation allowlist (`git`, `gh`, `cat`, `rg`) are forced to escalate just to run at all. Counting those escalations and proposing to allowlist them further would be circular: they're already allowlisted, and the actual fix is pruning the stale worktrees driving the profile size, not growing the bypass list. Worktree cleanup is a manual maintenance step and out of scope for this tool — it only needs to keep the E2BIG count from contaminating the other two sections.

The tool sidesteps this by classifying every record into one of three signals instead of one merged ranking. Each signal maps to a distinct action:

| Section                              | Source                                                                                                                                                                                                                                                                                                                    | What it means                                                                                                                         | Action                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Genuine bypass candidates**        | Non-E2BIG Claude sandbox failures (`Operation not permitted`, localhost timeout — not the E2BIG arg-limit error). Codex `with_escalated_permissions` uses are captured live by the session-friction hook instead (see [saving.md](saving.md#file-structure)'s `## Sandbox & Permission Audit` guidance), not by this scan | The command needed elevated access for a real reason (usually network access: package installs, registry fetches, live-service calls) | Consider adding to the escalation allowlist (see below)                             |
| **Block candidates**                 | Claude `toolDenialKind: "user-rejected"` — a human explicitly declined the command                                                                                                                                                                                                                                        | A human judged this command unsafe or wrong in context                                                                                | Consider adding to `permissions.deny` / the `dev/codex-hooks/policy.mts` block list |
| **Escalation pressure (root cause)** | Every Claude `dangerouslyDisableSandbox` escalation, split into already-covered-by-policy vs. uncovered, plus the E2BIG failure count                                                                                                                                                                                     | How much friction the sandbox itself is causing, separate from whether any individual command needs a policy change                   | If E2BIG dominates, the fix is pruning stale worktrees, not editing the allowlist   |

`toolDenialKind: "permission-rule"` and `"automode-blocked"` denials are reported only as a low-priority hygiene count — they're the block policy _working as intended_ (e.g. the force-push block), not candidates for anything.

**Worktree write-path denials** from both Claude and Codex are reported as one separate count, not folded into genuine bypass candidates. The shared conservative classifier requires Git command context (`git`, including `env … git` wrappers) plus a Git-produced diagnostic (`fatal:`/`error:`/`warning:`) with an adjacent `Operation not permitted`/`EPERM`/`Permission denied`/`EROFS`/`Read-only file system` token on `.git/worktrees/<name>/...`, `.git/config`, `.git/packed-refs`, or any `.git/refs/…` / `logs/refs/…` namespace. Displayed denial-shaped file content from read-only commands such as `git show`/`git diff` is not a diagnostic. An allowlist entry does not fix any of these; the sandbox's linked-worktree Git write-path coverage must change, so the records are structurally excluded from Section 1. The path/token adjacency rule keeps ordinary `index.lock: File exists` contention and unrelated permission failures out of the count.

Codex extraction reads normalized `event_msg/item_completed` `CommandExecution` results, not the outer `functions.exec` JavaScript or presentation output. The normalized item supplies the command, exit status, and aggregate stdout/stderr. Classification inspects that output even when the process exits zero, because a remote push can succeed before Git fails to update local config or a remote-tracking ref. Default Markdown and JSON expose only the aggregate count; full commands, paths, and failure text remain available only under `--raw`. This tool diagnoses the repository-owned evidence and routing gap; changing Codex's upstream linked-worktree sandbox boundary remains out of scope.

The tool categorizes; it does not decide safe-vs-unsafe for you. Read the normalized command prefix and the justification/denial context yourself before acting on either list.

### Repo scoping

The tool discovers transcripts from every Claude/Codex session on the machine
(`~/.claude/projects/**`, `~/.codex/sessions/**`), not just this repo — but it only scans files
whose recorded `cwd` falls inside this repo's roots: the main checkout plus every registered
worktree, resolved via `git rev-parse --git-common-dir` and `git worktree list`, then minimized to
drop any worktree already nested inside another root. Files outside those roots are skipped and
counted in the `Scope:` line's "skipped (other repo)" figure; files whose `cwd` could not be
determined are skipped and counted separately as "skipped (cwd unknown)" — excluded, never silently
dropped without a count. This is the fix for [#9406](https://github.com/jonathanong/filaments/issues/9406):
before repo scoping, another repo's commands (there, `~/harness`'s `pnpm links`) could be reported
as a filaments allowlist gap. Sanity-check the `Scope:` line before trusting a report — if the
resolved root looks wrong, something is off. A nonzero "skipped (other repo)" count proves other-repo
files were reached and correctly excluded; a 0 is not proof of the opposite — the lazy walk (below)
can fill `--limit` from in-repo files alone and stop before reaching any other-repo file, so 0 is
also the expected reading on a machine used for only this repo, or during a quiet stretch for other
repos.

Known gap: a worktree that has since been deleted, if it lived outside the main repo root, is no
longer discoverable from `git worktree list`, so its transcripts get skipped as "other repo" even
though they were genuinely this repo's. Use the repeatable `--repo-root <path>` flag to override the
auto-resolved roots — for example, restoring a since-deleted worktree's known path, or deliberately
pointing at a different repo's transcripts (with that repo's own `--settings-path`) as a positive
control.

### Decision criteria

Before treating an uncovered prefix as a genuine gap, verify the command is actually invokable in
this repo — check that the binary, script, or `package.json` entry it names still exists on `HEAD`,
not just that the prefix looks plausible. Repo scoping (above) filters by where the session ran, not
by whether the named command belongs to this repo; and even within this repo, a transcript can be
stale (a script renamed or removed since the session ran).

**Genuine bypass candidate, and you judge it read-only/safe:** add it to the escalation allowlist across **all three surfaces** that must stay consistent:

- `sandbox.excludedCommands` in `.claude/settings.json`
- `permissions.allow` in `.claude/settings.json` (the `Bash(...)` entry)
- a matching `prefix_rule(pattern=[...], decision="allow")` in `.codex/rules/default.rules`

`dev/agent-sandbox-config.test.mts` enforces this three-surface consistency and also asserts narrowness — it must keep failing on broad prefixes like `git` or `gh` alone. Any addition must be a specific command family (e.g. `git log`, not `git`), and the test must still pass after the change.

**Genuine bypass candidate needing network access you're not sure is safe to blanket-allow:** don't add it to the allowlist just because it appeared once. Escalation is the correct behavior for a command that will always need a human or auto-mode judgment call (e.g. an unfamiliar `curl` target). Flag it in the retro for a human to decide instead of allowlisting it silently.

**Block candidate:** propose the addition (a `permissions.deny` entry, or a new check in `dev/codex-hooks/policy.mts` if it needs to gate Codex too) but **surface it for human review — never auto-write a deny rule from the retro.** A single rejection is one data point; confirm the pattern is real (recurring across sessions, not a one-off misunderstanding) before proposing a durable block.

### Privacy

The report's default output is prefix-only: a normalized `<leading command> <subcommand>` plus counts, not the raw command line and never Codex justifications. Any token over 40 characters is redacted outright (never truncated), so long embedded payloads — JSON blobs, giant quoted args, a secret glued into a `VAR=...` assignment — never reach default output.

This is a prefix boundary, not a full-command boundary: for a short two-token command, the "prefix" **is** the whole command. `./dev/tmux-name my-topic-slug` or `source /tmp/my-script.sh` pass through unredacted whenever the second token is under 40 characters, so a branch/topic slug, short path, or hostname can appear verbatim. Retros get distilled into public GitHub issues by `retrospective-distill`, so skim the (non-`--raw`) output before pasting it into the retro file and hand-redact anything sensitive — don't assume "not `--raw`" means "nothing sensitive." `--raw` goes further still (full commands, Codex justifications, and sandbox-failure text) and is local-inspection-only; never paste `--raw` output into the retro file.

### Related

- [`dev/agent-sandbox-config.test.mts`](../../../dev/agent-sandbox-config.test.mts) is the consistency guard for the escalation allowlist across `.claude/settings.json` and `.codex/rules/default.rules`.
- [`dev/codex-hooks/policy.mts`](../../../dev/codex-hooks/policy.mts) is where a runtime block (rather than a static `permissions.deny` entry) gets implemented when a command needs to be caught by pattern rather than by exact prefix.
- [Agent Sandbox](../../../docs/development/agent-sandbox.md) is the policy-rationale counterpart to this doc: why `git`/`gh`/`docker`/`pnpm` stay excluded (including the E2BIG argument this doc makes about read-only git), and why the credentialed-CI threat this data drives escalation-list decisions around is already contained for Claude.
