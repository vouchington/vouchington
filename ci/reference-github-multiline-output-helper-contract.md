# GitHub multiline output helper contract

[Back to CI Tooling](README.md#github-multiline-output-helper-contract)

`write-github-multiline-output.sh <output-name>` reads the complete value from stdin and appends
exactly one multiline record to `$GITHUB_OUTPUT`. The output name must match
`^[A-Za-z_][A-Za-z0-9_-]*$`. Its UUID-backed delimiter is rejected and regenerated whenever the
full marker occurs anywhere in the value, preventing untrusted text from forging sibling outputs.
Callers must execute the helper from a trusted checkout; see
[Standalone Workflow Checks § Auto Harness automation workflows](../docs/development/reference-ci-standalone-workflow-checks.md#codex-automation-workflows-are-standalone).
