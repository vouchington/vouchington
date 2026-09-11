# Account Data Requests System

Processes GDPR-style user account data export requests and cleans up expired exports.

## Queue Configuration

### `account-data-requests` (concurrency: 2)

- `processExportRequest` — generates a user's data export archive and uploads it to S3, then emails the user a download link
- `processCleanupExpiredExports` — removes expired export archives from S3
- `recoverExportRequests` — every five minutes re-enqueues unstarted requests and rotates attempts stuck for 30 minutes
- **Lock duration**: 600,000 ms (10 min); stalled interval: 30,000 ms (default) — covers full export archive generation p99 ~5 min for large accounts

Requests and attempt tokens are retained in `user_data_requests` for legal auditability. Export
jobs use `account-data-export__<request-id>__<attempt-id>` as both job and deduplication ID. Lifecycle
writes are fenced by the attempt token, and each attempt uploads to its own S3 key so a stale worker
cannot delete or complete the winning attempt. Recovery is scheduled and admin-triggerable.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Account deletion requirements: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
- Data retention service: [../../services/data-retention/README.md](../../services/data-retention/README.md)
