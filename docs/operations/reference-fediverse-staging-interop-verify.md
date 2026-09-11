# Verify

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#verify)

For every executed matrix cell, preserve only this redacted evidence:

| Field              | Required value                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| Revision and time  | `DEPLOYED_SHA` and UTC timestamp                                           |
| Remote             | software, exact version, and hostname                                      |
| Correlation        | activity ID and request ID; no signed headers or tokens                    |
| Action             | discovery, Follow, Accept, Undo, or transport                              |
| Local observation  | HTTP result, relation state, queue state, or Sentry delivery-failure state |
| Remote observation | HTTP result and remote state or log result                                 |
| Outcome            | `pass`, `fail`, or `unsupported` with a short reason                       |

A successful run has evidence for each applicable `Validate` cell, no leaked credentials, all test
state cleaned up, and no unexplained Sentry delivery-failure events. Attach the completed matrix to
the PR Shepherd Journal and summarize it on the tracking issue.
