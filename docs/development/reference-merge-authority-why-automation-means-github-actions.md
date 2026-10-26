# Automation contexts

[Back to Merge Authority](merge-authority.md#why-automation-means-github-actions)

The hook treats CI and unattended Claude sessions as automation. That includes GitHub Actions,
GitLab CI, and `claude -p` even when the latter is launched from an interactive shell. The
published runner classifies these contexts before evaluating Voucha's merge and protected-path
rules. A missing attended signal gets no special interactive merge allow.

An attended local session authenticates with the human's own `gh` credentials. Its merge decision
still requires a direct human request; the hook's silent allow only removes a duplicate tool prompt
for a single plain merge after that request. The [decision flow](reference-merge-authority-decision-flow.md)
shows which other commands receive no hook opinion.

If a merge is unexpectedly blocked in an attended local session, inspect the CI markers inherited
by the hook process. Local tooling can set them too, and the automation block takes precedence.
