Organize all existing open GitHub issues with the approved labels and milestones; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->
<!-- harness-scheduled-scope: existing-issues -->

Invoke `vouchington-workflow:organize-github-issues` and follow its guardrails. Process one stable ascending page of at most 50 open issues against the live labels and open milestones: normalize each to exactly one canonical priority, add or remove supported existing labels, and assign or move an existing milestone when evidence is clear. Do not claim to have inspected issues outside the page.

Do not create labels, milestones, or issues; do not close issues or edit titles, bodies, assignees, projects, or issue types. Use the organizer's marked clarification comment only when classification is genuinely ambiguous. Report one representative changed issue number, or why none changed.
