Organize all existing open GitHub issues with the approved labels and milestones; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->
<!-- harness-scheduled-scope: existing-issues -->

Invoke `$organize-github-issues` and follow its guardrails. Fetch and process one stable ascending
issue-number page of at most 50 existing open issues, idempotently using the live labels and open
milestones. Do not claim that issues outside that page were inspected. Normalize each supplied issue to
exactly one canonical priority, add or remove supported existing labels, and assign or move an
existing milestone when the issue evidence is clear.

Do not create labels, milestones, or issues. Do not close issues or edit titles, bodies, assignees,
projects, or issue types. Use the organizer's marked, nonduplicate clarification comment only when
classification is genuinely ambiguous.

After the supplied state of touched issues is verified, report one representative changed open
issue number from this page. If no issue changed, report a concise explanation.
