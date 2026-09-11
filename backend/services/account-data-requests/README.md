# Account Data Requests

GDPR/data portability export system that generates downloadable ZIP archives of user data.

## Overview

This service handles the full lifecycle of user data export requests: creating a request record, streaming all user data into CSV files, packaging them into a ZIP archive, uploading to S3, and generating time-limited presigned download URLs. Exports include profile, posts, votes, emails, phones, passkeys, OAuth accounts, followed RSS feeds, followed topics, entity relations, bookmarks, consents, and referral attributions.

## Key Files

- `create.mts` — Creates a `user_data_requests` record with `pending` status
- `create-or-conflict.mts` — Idempotent request creation (prevents duplicate in-flight requests)
- `export.mts` — Orchestrates CSV generation: streams each data category, writes CSV files, merges multi-source CSVs, creates ZIP archive
- `stream.mts` — PostgreSQL cursor-based streaming for profile, posts, votes, emails, phones, passkeys
- `stream-oauth.mts` — Streams OAuth account data across all providers
- `stream-entity-relations.mts` — Streams non-bookmark user-subject signals, including curated user-tag labels
- `stream-bookmarks.mts` — Streams bookmark data
- `stream-followed-rss-feeds.mts` — Streams followed RSS feed details
- `stream-followed-topics.mts` — Streams followed topic details
- `stream-consents.mts` — Streams consent records and referral attributions
- `s3.mts` — S3 operations: upload ZIP, generate presigned download URL (1-hour default), and delete expired exports in serial S3 batches of at most 1,000 objects
- `get.mts` — Query request status and metadata
- `update.mts` — Status transitions (pending → processing → ready/failed/expired)
- `types.mts` — `UserDataRequest` type with status lifecycle

## Export Contents

| CSV File                    | Data                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `profile.csv`               | User profile, privacy, processing, marketing consent, and preference settings                         |
| `posts.csv`                 | All non-deleted posts                                                                                 |
| `votes.csv`                 | User-authored vote history (posts, topics, hostnames, RSS items, entity relations, agent moderations) |
| `emails.csv`                | Email addresses                                                                                       |
| `phones.csv`                | Phone numbers                                                                                         |
| `passkeys.csv`              | Passkey metadata (no private keys)                                                                    |
| `oauth-accounts.csv`        | Connected OAuth provider accounts                                                                     |
| `followed-rss-feeds.csv`    | Followed RSS feeds with topic and URL details                                                         |
| `followed-topics.csv`       | Followed topics with slug and type details                                                            |
| `entity-relations.csv`      | Non-bookmark user-subject signals with resolved labels when available                                 |
| `bookmarks.csv`             | Merged bookmark data                                                                                  |
| `consents.csv`              | Legal and cookie consent ledger records                                                               |
| `referral-attributions.csv` | Referral click attributions                                                                           |

## Architecture Notes

- All data streaming uses PostgreSQL cursor-based async generators for constant memory usage
- CSV files are written via Node.js streams with backpressure handling
- Followed RSS feeds and topics are included for account data portability. The lightweight
  synchronous export cap does not automatically create or redirect to full account-data exports.
- Boolean CSV fields use `true`/`false` strings so explicit opt-outs remain distinct from unset
  values, which stay empty.
- Synthetic migration repair events are excluded from `votes.csv`; their preserved source events
  are the user's portable vote history.
- Entity relations and bookmarks are exported per-predicate into temp files, consumed serially to
  bound PostgreSQL cursor/client use, then merged with deduped headers
- ZIP packaging uses `yazl` (a small streaming ZIP writer; one runtime dep, `buffer-crc32`) with default deflate compression
- S3 exports have a 7-day TTL, after which they transition to `expired` status
- Presigned download URLs default to 1-hour expiry
- PostgreSQL rejects simultaneous ready/failed timestamps and prevents a terminal result from
  being cleared or replaced. Queue retries therefore no-op after the first terminal transition.
- Processing and recovery claim the owner lifecycle advisory lock, then re-check that the user is
  active. A deletion that wins the same fence leaves queued export work unclaimed; an already
  claimed attempt is retained in `user_data_request_attempts`. Stale recovery can rotate the
  current token without forgetting the old worker's deterministic object key, and deletion records
  every retained key as durable S3 cleanup before expiring the request.
- Immediately before `PutObject`, the worker acquires a PostgreSQL-clock upload lease under that
  same active-user fence and gives S3 an abort deadline before lease expiry. Deletion retains leased
  keys and remains in its account-data phase until the provider-effect window closes. Stale token
  rotation keeps the displaced attempt's deterministic object key so deletion can purge it after the
  lease expires.
- Automatic recovery claims unstarted dispatched work after five minutes and stale processing attempts
  after thirty minutes. Terminally failed exports remain legal records and require a new user
  request; non-terminal worker failures keep `failed_at` unset so recovery can rotate their attempt.

## Related

- S3 infrastructure: [backend/modules/aws/README.md](../../modules/aws/README.md)
- Job queue (async export processing): [backend/queues/account-data-requests/README.md](../../queues/account-data-requests/README.md)
