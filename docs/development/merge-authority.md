# Merge Authority

**The rule:** merging (`gh pr merge`, `gh stack merge`, `gh api .../merge`, `gh api graphql` merge/auto-merge
mutations) is hard-blocked for every agent tool call running in **automation**. That includes CI
and unattended Claude sessions. The check is coarse, so it also blocks some commands that only
mention a merge; see the
[decision flow](reference-merge-authority-decision-flow.md). In an
**attended interactive Claude session**, the human has already made the merge decision by asking
for it in their own message, so a command that is exactly one `gh pr merge`, or one `gh stack
merge` with a PR number, proceeds without a further tool-level prompt. The hook has no opinion on
any other interactive merge. That covers compound or wrapped commands, `gh api` merges, and every
merge in Codex or Grok. For those, the harness's own prompt,
approval policy, or auto-mode classifier decides. A block anywhere in the command (force-push,
`--no-verify`, `HUSKY=0`, and so on) always beats the merge allow. This is enforced by a single
policy engine shared by Claude Code and Codex, not by per-prompt
wording or the `Main` branch ruleset. The shared engine and hook CLI come from
`vouchington-tooling/command-policy`; Voucha supplies the local rule table.

**Attended** means Claude Code set `CLAUDE_CODE_SESSION_ATTENDED=1` in the hook's environment.
Claude Code sets it to `1` for an interactive session and `0` for `claude -p`, including a
`claude -p` nested inside an interactive session and the Auto Harness `claude -p --permission-mode
auto` command. That is observed behavior, not a documented contract, so the check fails safe: if
Claude Code stops setting the variable, the allow disappears and the harness prompts.

## Contents

- <a id="why-automation-means-github-actions"></a>[Automation contexts](reference-merge-authority-why-automation-means-github-actions.md)
- <a id="decision-flow"></a>[Decision flow](reference-merge-authority-decision-flow.md)
