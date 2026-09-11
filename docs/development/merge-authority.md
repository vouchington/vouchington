# Merge Authority

**The rule:** merging (`gh pr merge`, `gh stack merge`, `gh api .../merge`, `gh api graphql` merge/auto-merge
mutations) is hard-blocked for every agent tool call running in **GitHub Actions**. Running
**interactively**, the human has already made the merge decision by asking for it in their own
message, so the hook lets it proceed without a further tool-level prompt. This is enforced by a
single policy engine — the checked-in PreToolUse hook shared by Claude Code and Codex — not by
per-prompt wording or the `Main` branch ruleset.

## Contents

- <a id="why-automation-means-github-actions"></a>[Why "automation" means GitHub Actions](reference-merge-authority-why-automation-means-github-actions.md)
- <a id="decision-flow"></a>[Decision flow](reference-merge-authority-decision-flow.md)
- <a id="automation-pr-labeling"></a>[Automation PR labeling](reference-merge-authority-automation-pr-labeling.md)
- <a id="accepted-automation-ci-risk"></a>[Accepted automation CI risk](reference-merge-authority-accepted-automation-ci-risk.md)
- <a id="see-also"></a>[See also](reference-merge-authority-see-also.md)
