# Platform

Backend platform requirements: API performance, job replayability, data points spec, and agent access.

## Documents

| File                                                      | Description                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [API Performance](./api-performance.md)                   | Performance conventions for all backend API routes                                            |
| [Job Replayability & Idempotency](./JOB-REPLAYABILITY.md) | Idempotency standard, backfill registry, and per-queue replayability matrix for glide-mq jobs |
| [Data Points Spec](./data-points-spec.md)                 | Structured data point schemas per vertical, aggregation views, and data quality rules         |
| [Agent Access](./agent-access.md)                         | Why and how discovery steers AI agents to the API and MCP instead of browser automation       |

## Sync Rule

When API performance conventions, job idempotency requirements, or data point schemas change,
update the relevant doc here and cross-link from `backend/AGENTS.md` and relevant service docs.

## Reference index

- [Email Classification](email-classification.md)
- [Data Points Specification reference](reference-data-points-spec-ai-tool-fields.md)
- [Data Points Specification reference](reference-data-points-spec-bank-account-fields.md)
- [Data Points Specification reference](reference-data-points-spec-credit-card-fields.md)
- [Data Points Specification reference](reference-data-points-spec-data-quality-rules.md)
- [Data Points Specification reference](reference-data-points-spec-hardware-fields.md)
- [Data Points Specification reference](reference-data-points-spec-multi-topic-review-enhancements-planned.md)
- [Data Points Specification reference](reference-data-points-spec-overview.md)
- [Data Points Specification reference](reference-data-points-spec-review-structure-by-vertical.md)
- [Job Replayability & Idempotency reference](reference-job-replayability-backfill-implementation-pattern.md)
- [Job Replayability & Idempotency reference](reference-job-replayability-non-replayable-queues-by-design.md)
- [Job Replayability & Idempotency reference](reference-job-replayability-overview.md)
- [Job Replayability & Idempotency reference](reference-job-replayability-queue-replayability-matrix.md)
- [Job Replayability & Idempotency reference](reference-job-replayability-rules-for-new-jobs.md)
