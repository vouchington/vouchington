# Member Draft-Intent Recovery

[Back to the AI agents queue](README.md#member-draft-intent-recovery-matrix)

The `reconcile-member-support-agent-intents` job recovers member-created support draft work from
durable `support_agent_runs` intent. This matrix records every required transition mode.

| Failure point                        | Detectable durable state                          | Recovery / idempotency                                                            | Evidence |
| ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Dispatcher enqueue fails             | Unfinished `member_thread` run                    | Next five-minute scan re-enqueues its stable message ID                           | R1       |
| Provider not consumed                | N/A: reconciler only dispatches                   | No external provider call                                                         | P1       |
| Provider consumed, DB fails          | N/A: handled by keyed `customer-support` consumer | Run claim and fencing govern worker retry                                         | F1       |
| Commit succeeds, caller loses reply  | Unfinished run remains                            | Reconciler re-derives it; simple dedup keeps one job                              | R1       |
| Delivery retries or terminal failure | Retained GlideMQ job plus unfinished run          | Bulk helper retries only the matching stable ID                                   | R1       |
| Queue TTL or trimming                | `support_agent_runs` remains durable              | Cursor scan recreates the job from PostgreSQL                                     | R1       |
| Orphan cleanup                       | Completed run no longer matches scan              | Terminal completion removes it from future recovery                               | F2       |
| Normal terminal removal              | Completed GlideMQ job may remain retained         | Exact completed stable ID is removed before re-add only when intent is unfinished | R1       |

- **R1:** [`process-reconcile-member-support-agent-intents.real-glide.mock.test.mts`](../../workers/ai-agents/processors/process-reconcile-member-support-agent-intents.real-glide.mock.test.mts), `recovers a committed member draft intent through PostgreSQL and GlideMQ exactly once`.
- **P1:** [`process-reconcile-member-support-agent-intents.test.mts`](../../workers/ai-agents/processors/process-reconcile-member-support-agent-intents.test.mts), `enqueues each durable page before advancing its cursor`.
- **F1:** [`finalize-keyed-support-agent-run.test.mts`](../../services/customer-support/finalize-keyed-support-agent-run.test.mts), `rolls back the draft and lifecycle when run completion fails`.
- **F2:** The same file, `atomically creates one draft lifecycle and completes its run`.
