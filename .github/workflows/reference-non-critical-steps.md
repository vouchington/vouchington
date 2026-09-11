# Non-Critical Steps

[Back to Workflow Authoring Reference](AUTHORING.md#non-critical-steps)

Non-critical steps must not block CI. Add `continue-on-error: true` and an appropriate `timeout-minutes` so external service outages or hangs do not fail the workflow.

| Step type                 | Timeout | continue-on-error | Examples                                        |
| ------------------------- | ------- | ----------------- | ----------------------------------------------- |
| Artifact uploads          | 1m      | true              | `actions/upload-artifact@v7`                    |
| Vitest marker attempts    | 1m each | true per attempt  | `upload-vitest-report-attempt`                  |
| Consumed coverage uploads | 3m      | true              | `actions/upload-artifact@v7`                    |
| Artifact downloads        | 2m      | —                 | `actions/download-artifact@v8`                  |
| PR comments / labels      | 1m      | true              | `actions/labeler@v6`, PR comment upsert scripts |
| Run summaries             | 1m      | true              | `write-run-summary.mts`                         |
| Image size reporting      | 1m      | true              | Docker image inspect + `$GITHUB_STEP_SUMMARY`   |

Coverage and Vitest-blob producers upload directly to GitHub artifacts; there is no separate
transport chain to budget for. Job timeout ceilings are enforced generically by the
`github-actions-job-timeouts` `no-mistakes` rule rather than a dedicated structural guard. See
[CI Job Timeout Budgets](../../docs/development/reference-ci-ci-job-timeout-budgets.md#fail-fast-budget-relationship)
for the exact per-step minute caps and derived job budgets.

**Do NOT add `continue-on-error`** to production-critical steps (S3 asset uploads, Docker smoke
tests, test execution).

The two Vitest marker upload attempts are individually non-critical so a transient blob-storage
stall can reach the conditional retry. Their terminal `artifact-upload-outcome.mts` gate is
production-critical and must not use `continue-on-error`: it fails closed when neither bounded
attempt succeeds.
