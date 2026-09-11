# Platform

Backend platform requirements: API performance, job replayability, and data points spec.

## Documents

| File                                                      | Description                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [API Performance](./api-performance.md)                   | Performance conventions for all backend API routes                                            |
| [Job Replayability & Idempotency](./JOB-REPLAYABILITY.md) | Idempotency standard, backfill registry, and per-queue replayability matrix for glide-mq jobs |
| [Data Points Spec](./data-points-spec.md)                 | Structured data point schemas per vertical, aggregation views, and data quality rules         |

## Sync Rule

When API performance conventions, job idempotency requirements, or data point schemas change,
update the relevant doc here and cross-link from `backend/CLAUDE.md` and relevant service docs.
