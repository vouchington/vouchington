# Merge Authority

**The rule:** a human decides every merge. Agents never merge or arm auto-merge (`gh pr merge`,
`gh stack merge`, `gh api .../merge`, `gh api graphql` merge or auto-merge mutations) unless the
human asked for that merge in their own message. This includes CI and unattended sessions such as
`claude -p`, which never merge.

Nothing in this repository enforces the rule by hook. The harness's permission settings and auto
mode decide whether a merge command runs, and branch protection on `main` and the `Main` ruleset
are the last boundary. The rule applies equally to every harness: a merge request in a human's
message is the authority for that one merge, and it does not extend to other PRs.

The attended local triage loop (`triage-loop` skill) merges only within the scoped grant the human
gave it for that session. Every other agent, including the subagents the loop dispatches and any
agent that posts `/shepherd`, never merges or arms auto-merge.
