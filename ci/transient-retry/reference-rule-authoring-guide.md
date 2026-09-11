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

| Field              | Type                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exampleRunUrls`   | `string[]`                                                                                  | Links to real runs that triggered this rule. Helps with audits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `decision`         | `rerun \| ignore`                                                                           | Default `rerun`. Use `ignore` only when the fingerprint has no actionable code signal and rerunning is expected to keep producing no signal. `dispatch` is not a rule-level option; it is the fallthrough when no rule matches.                                                                                                                                                                                                                                                                                                                                       |
| `needsLogs`        | `boolean`                                                                                   | Set `true` if `match()` calls `ctx.failedJobLogs()` or `ctx.jobLogs()`. Logs are fetched lazily and cached.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `needsAnnotations` | `boolean`                                                                                   | Set `true` if `match()` calls `ctx.failedJobAnnotations(jobName)`. Annotations are fetched lazily across all pages for that job name and cached.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rerunTarget`      | `{ jobName: string } \| { jobNameFamily: string; resolveJobName: (ctx) => string \| null }` | Restricts a matching rerun rule to one GitHub job database ID. The exact-name form keeps the target identity auditable by a static string. The family form is for jobs whose exact name is dynamic (e.g. matrix shards sized by a repo variable): `resolveJobName` must return the exact name for this run, and resolution fails closed — a `null` return, or a resolved name that does not start with `jobNameFamily`, throws rather than silently falling back to a full-workflow rerun. GitHub also reruns downstream dependent jobs of whichever job is selected. |

The targeted-rerun closure follows GitHub's
[rerun-job API](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run):
the selected job and downstream dependents rerun while upstream siblings are reused. This was also
confirmed in [run 29175307375](https://github.com/jonathanong/filaments/actions/runs/29175307375).
Every rule with `rerunTarget` must also have an exact entry in the central
[`targetedReruns` topology table](../../.github/workflows/workflow-topology-policy-routes.mts). That
entry names the selected inner job, its exact GitHub job name or job-name family (matching whichever
shape the rule declares), its complete inner downstream closure, and each outer reusable caller with
its complete downstream closure. The topology test compares the table exhaustively against
`rules.mts` and fails when a target identity, caller, or downstream closure drifts in either
direction; rules without `rerunTarget` must not appear in the table. The dynamic backend-shard family
(`test-backend-unit / backend-tests (N)`, where `N` comes from the typed Vitest ownership registry
or a validated manual-dispatch override) is why the family form exists — see
`backendUnitVitestWorkerExitAfterPassRule` in `backend-test-rules.mts`.

### When to set `needsLogs: true`

Only set `needsLogs: true` when the job name alone is insufficient to identify the transient pattern and `match()` calls `ctx.failedJobLogs()` or `ctx.jobLogs()` (e.g. to detect a specific error string). Fetching logs makes one extra API call per failed job, so omit it when unnecessary. Historical replay observes fetch failures without forcing a download: a rule skipped by its cap or an early guard does not request logs, while a matcher that actually requests unavailable logs preserves only the already-proven ordered-rule prefix; the failing rule and suffix use the shared fallback. If the first rule's evidence is unavailable, all rules use that shared fallback.

Rules normally inspect failed job logs through `ctx.failedJobLogs()`. When the stable fingerprint
lives in a successful upstream producer job rather than the failed fan-in job, use
`ctx.jobLogs(['exact job name'])` so the extra log fetch stays explicitly scoped.
Targeted rules should use this explicit fetcher for their selected job, so unrelated failed or
cancelled jobs do not cause unnecessary log downloads.

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
  exampleRunUrls: ['https://github.com/org/repo/actions/runs/12345'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!ctx.failedJobNames.includes('integration-test')) return false
    const logs = await ctx.failedJobLogs()
    return logs.get('integration-test')?.includes('503 Service Unavailable') ?? false
  },
}
```
