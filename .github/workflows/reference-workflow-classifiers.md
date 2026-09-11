# Workflow Classifiers

[Back to Workflow Authoring Reference](AUTHORING.md#workflow-classifiers)

When a workflow classifies logs, statuses, or failure text, make the classifier reviewable before
pushing:

- Inspect the linked failure first, then sample recent same-workflow runs for true positives and
  false positives. Include ordinary review prose or benign logs that mention auth, API requests,
  rate limits, quotas, credentials, or status codes.
- Add table tests for every classifier phrase family before changing the workflow. Cover expected
  matches such as explicit rate-limit/quota exhaustion, invalid credentials, HTTP 401/403/429, and
  timeout/deadline wording, plus non-matches that merely discuss those topics.
- Keep inline YAML/shell classifiers simple. If the pattern needs helpers, fixtures, or multiple
  branches, extract it to a `ci/` script and follow the extracted-script rules below.
- Prefer clear exit-status handling over output-text classification when the tool already reports
  failures deterministically.
