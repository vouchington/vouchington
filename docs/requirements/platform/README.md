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
update the relevant doc here and cross-link from `backend/CLAUDE.md` and relevant service docs.
