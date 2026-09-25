# Merge Authority

**The rule:** merging (`gh pr merge`, `gh stack merge`, `gh api .../merge`, `gh api graphql` merge/auto-merge
mutations) is hard-blocked for every agent tool call running in **GitHub Actions**. That check is
coarse, so it also blocks some commands that only mention a merge; see the
[decision flow](reference-merge-authority-decision-flow.md). In an
**attended interactive Claude session**, the human has already made the merge decision by asking
for it in their own message, so a command that is exactly one `gh pr merge`, or one `gh stack
merge` with a PR number, proceeds without a further tool-level prompt. The hook has no opinion on
any other interactive merge. That covers compound or wrapped commands, `gh api` merges, and every
merge in Codex, Grok, or an unattended `claude -p` session. For those, the harness's own prompt,
approval policy, or auto-mode classifier decides. A block anywhere in the command (force-push,
`--no-verify`, `HUSKY=0`, and so on) always beats the merge allow. This is enforced by a single
policy engine — the checked-in PreToolUse hook shared by Claude Code and Codex — not by per-prompt
wording or the `Main` branch ruleset.

**Attended** means Claude Code set `CLAUDE_CODE_SESSION_ATTENDED=1` in the hook's environment.
Claude Code 2.1.282 sets it to `1` for an interactive session and `0` for `claude -p`, including a
`claude -p` nested inside an interactive session and the Auto Harness `claude -p --permission-mode
auto` command. That is observed behavior, not a documented contract, so the check fails safe: if
Claude Code stops setting the variable, the allow disappears and the harness prompts.

## Contents

- <a id="why-automation-means-github-actions"></a>[Why "automation" means GitHub Actions](reference-merge-authority-why-automation-means-github-actions.md)
- <a id="decision-flow"></a>[Decision flow](reference-merge-authority-decision-flow.md)
- <a id="automation-pr-labeling"></a>[Automation PR labeling](reference-merge-authority-automation-pr-labeling.md)
- <a id="accepted-automation-ci-risk"></a>[Accepted automation CI risk](reference-merge-authority-accepted-automation-ci-risk.md)
- <a id="see-also"></a>[See also](reference-merge-authority-see-also.md)
