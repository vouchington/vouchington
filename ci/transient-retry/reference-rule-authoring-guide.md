# Rule authoring guide

[Back to Transient-Retry Rule Catalogue](README.md#rule-authoring-guide)

### Required fields

| Field          | Type       | Notes                                                                                                                                                                     |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`   | Stable slug, kebab-case, used in logs and telemetry. Never reuse a retired id.                                                                                            |
| `consumerKey`  | `string`   | Stable identity of the command/action being retried. Rules for the same consumer and root cause must be consolidated.                                                     |
| `rootCauseKey` | `string`   | Stable identity of the transient cause family, independent of status-code, URL, or other surface variants.                                                                |
| `description`  | `string`   | One sentence, human-readable. Agents read this to understand the fingerprint.                                                                                             |
| `rationale`    | `string`   | Why this is transient rather than a code bug.                                                                                                                             |
| `maxAttempts`  | `number`   | Default `1`. Increase only with evidence the same failure can repeat transiently. Reruns use the per-rule occurrence count; other decisions use the shared attempt count. |
| `match`        | `function` | Receives `WorkflowRunContext`, returns `boolean \| Promise<boolean>`.                                                                                                     |

### Optional fields

| Field              | Type              | Notes                                                                                                                                                                                                                           |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exampleRunIds`    | `string[]`        | GitHub Actions run IDs from the archived predecessor repository that triggered this rule, kept for audit provenance. That repository is private, so no URL is rendered — only the numeric id.                                   |
| `decision`         | `rerun \| ignore` | Default `rerun`. Use `ignore` only when the fingerprint has no actionable code signal and rerunning is expected to keep producing no signal. `dispatch` is not a rule-level option; it is the fallthrough when no rule matches. |
| `needsLogs`        | `boolean`         | Set `true` if `match()` calls `ctx.failedJobLogs()` or `ctx.jobLogs()`. Logs are fetched lazily and cached.                                                                                                                     |
| `needsAnnotations` | `boolean`         | Set `true` if `match()` calls `ctx.failedJobAnnotations(jobName)`. Annotations are fetched lazily across all pages for that job name and cached.                                                                                |

### When to set `needsLogs: true`

Only set `needsLogs: true` when the job name alone is insufficient to identify the transient pattern and `match()` calls `ctx.failedJobLogs()` or `ctx.jobLogs()` (e.g. to detect a specific error string). Fetching logs makes one extra API call per failed job, so omit it when unnecessary. Historical replay observes fetch failures without forcing a download: a rule skipped by its cap or an early guard does not request logs, while a matcher that actually requests unavailable logs preserves only the already-proven ordered-rule prefix; the failing rule and suffix use the shared fallback. If the first rule's evidence is unavailable, all rules use that shared fallback.

Rules normally inspect failed job logs through `ctx.failedJobLogs()`. When the stable fingerprint
lives in a successful upstream producer job rather than the failed fan-in job, use
`ctx.jobLogs(['exact job name'])` so the extra log fetch stays explicitly scoped.

### When to set `needsAnnotations: true`

Use `needsAnnotations: true` when GitHub exposes the stable fingerprint as a check-run annotation rather than log text, such as runner infrastructure failures where the raw job log archive may be unavailable.

### Default `maxAttempts: 1`

Use `maxAttempts: 1` (the default) unless you have concrete evidence that the same transient fingerprint can repeat more than once before clearing. A high `maxAttempts` delays Harness dispatch for real failures. For `rerun` rules, unrelated prior fingerprints do not consume the budget: replay increments a rule only when it wins evaluation and returns `rerun`. `ignore` retains the shared counter because it does not represent a completed retry of one transient fingerprint.

### Real-log fixtures and counterfixtures

When a genuine transient reaches Harness because the catalogue missed its consumer or fingerprint,
the classifier PR must include a trimmed log fixture from the observed run and counterfixtures for
durable look-alikes. Preserve the stable command/start marker, the transient marker, and enough
surrounding output to prove the consumer had begun; remove unrelated setup noise. Counterfixtures
must cover the consumer's repository-owned failures, missing start evidence, absent transient
markers, and exhausted per-rule budget. A passing rerun confirms evidence but is not a substitute
for this regression coverage.

### Rule ordering

Rules are evaluated in array order. The first eligible rule whose `match()` returns `true` wins. Eligibility uses `ctx.ruleAttempts.get(rule.id)` for `rerun`, then falls back to the shared `ctx.ruleAttempt` and raw `ctx.runAttempt`; non-rerun decisions always use the shared values. Historical replay uses this same cap and ordering logic, so rule IDs and ordering are durable classification semantics: keep IDs stable and place more specific rules before more general ones.

### Example rule

```ts
{
  id: 'my-flaky-integration-test',
  consumerKey: 'my-integration-test-client',
  rootCauseKey: 'external-service-unavailable',
  description: 'A specific integration test job fails with a known network error.',
  rationale: 'The external service occasionally returns 503 on first connection; retrying always succeeds.',
  exampleRunIds: ['12345'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!ctx.failedJobNames.includes('integration-test')) return false
    const logs = await ctx.failedJobLogs()
    return logs.get('integration-test')?.includes('503 Service Unavailable') ?? false
  },
}
```
