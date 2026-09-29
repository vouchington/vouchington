# Workflow Change Preflight

[Back to Workflow Authoring Reference](AUTHORING.md#workflow-change-preflight)

Before changing workflow behavior because a third-party tool appears broken or slow, prove the
current upstream state first: read the release notes, inspect the exact failing run or action
output, and document the observed behavior in the PR. When pinning third-party actions, resolve
annotated tags with `refs/tags/<tag>^{}` before copying the SHA. Disabling expensive features such
as TurboSnap or `onlyChanged` must be documented as a cost, coverage, and runtime tradeoff, not a
silent simplification.

## Workflow Reference Hygiene

OpenTofu role and output deletions often require workflow cleanup too. Before first push, scan
workflow YAML, workflow tests, and the workflow reference for any retired role ARN variable,
secret, output name, job environment name, or `aws-actions/configure-aws-credentials` assumption.
The matching "Deleted resource checklist" section of the OpenTofu README (in the private
`vouchington-infra` repository) defines the resource-side cleanup.
