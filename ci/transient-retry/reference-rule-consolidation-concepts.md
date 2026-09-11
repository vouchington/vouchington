# Rule Consolidation Concepts

[Back to Transient-Retry Rule Catalogue](README.md#rule-consolidation-concepts)

The scoped [automatic invariants](CLAUDE.md#scoped-invariants) require one rule per consumer and
root cause, not per status code or URL. This section explains the concepts behind that rule.

### What "same root cause" means

A flake in the same external dependency (GitHub Releases CDN, an AWS control plane, a
self-hosted runner) is one root cause even if it surfaces as different HTTP status codes
(500 / 502 / 503 / 504), `curl` exit codes (22 / 56), step-timeouts, or different asset
paths within the same release. Similarly, an IAM permission denial that races the same
policy-update anchor (`aws_iam_policy.github_actions_<group>: (Creation|Modifications) complete`,
one of the five #9245 customer-managed policies) is one
root cause even when the denied AWS action differs (`lakeformation:GrantPermissions`,
`ssm:DescribeParameters`, `s3tables:CreateTableBucket`, etc.).

### How to broaden a fingerprint

Keep the consumer's terminal failure marker as the anchor — that proves the failure
happened in the right job context — then OR together the transient-cause variants:

```ts
const terminal = log.slice(log.lastIndexOf('Failed to install my-tool:'))
return (
  terminal.includes('github.com/owner/repo/releases/download/') &&
  (terminal.includes('HTTP 5') ||
    terminal.includes('curl: (22)') ||
    terminal.includes('curl: (56)') ||
    terminal.includes('timed out after'))
)
```

For multi-error logs (for example, an infrastructure apply with several failing resources), use
`errors.every(isKnownTransientError)` with a per-block predicate that ORs the action
variants — that way a genuine non-transient error mixed into the set is never silently
rerun:

```ts
function isInfrastructureBootstrapDeniedError(block: string): boolean {
  return (
    isLakeFormationGrantPermissionsBootstrapDeniedError(block) ||
    isSsmDescribeParametersBootstrapDeniedError(block) ||
    isS3TablesCreateTableBucketBootstrapDeniedError(block)
  )
}

// #9245 split the deploy role's inline policy onto five customer-managed
// aws_iam_policy resources, so the anchor checks a change to any of them
// instead of the single retired inline policy.
const INFRASTRUCTURE_POLICY_MODIFIED_RE =
  /aws_iam_policy\.deployment_(?:compute|data|identity|storage|platform): (?:Creation|Modifications) complete/

function hasInfrastructurePolicyModified(log: string): boolean {
  return INFRASTRUCTURE_POLICY_MODIFIED_RE.test(log)
}

export function hasInfrastructureApplyBootstrapDenied(log: string): boolean {
  const errors = infrastructureErrorBlocks(log)
  return (
    hasInfrastructurePolicyModified(log) &&
    errors.length > 0 &&
    errors.every(isInfrastructureBootstrapDeniedError) &&
    log.includes('Infrastructure apply exited with code 1.') &&
    log.includes('##[error]Process completed with exit code 1.')
  )
}
```
