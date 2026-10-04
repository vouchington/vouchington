# Account Data Requests

Source entrypoint: [backend/services/account-data-requests/README.md](../../../../../backend/services/account-data-requests/README.md)

GDPR/data portability export system that generates downloadable ZIP archives of user data.

## Overview

This service handles the full lifecycle of user data export requests: creating a request record, streaming all user data into CSV files, packaging them into a ZIP archive, uploading to S3, and generating time-limited presigned download URLs. Exports include profile, posts, votes, emails, phones, passkeys, OAuth accounts, followed RSS feeds, followed topics, entity relations, bookmarks, consents, referral attributions, and copyright records.

## Key Files

- `create.mts` — Creates a `user_data_requests` record with `pending` status, recording the subject (`user_id`) and the requester (`requested_by_id`)
- `create-or-conflict.mts` — Idempotent request creation (prevents duplicate in-flight requests)
- `export.mts` — Orchestrates CSV generation: streams each data category, writes CSV files, merges multi-source CSVs, creates ZIP archive
- `stream.mts` — PostgreSQL cursor-based streaming for profile, posts, votes, emails, phones, passkeys
- `stream-oauth.mts` — Streams OAuth account data across all providers
- `stream-entity-relations.mts` — Streams non-bookmark user-subject signals, including curated user-tag labels
- `stream-bookmarks.mts` — Streams bookmark data
- `stream-followed-rss-feeds.mts` — Streams followed RSS feed details
- `stream-followed-topics.mts` — Streams followed topic details
- `stream-consents.mts` — Streams consent records and referral attributions
- `stream-copyright.mts` — Streams the account's own decrypted copyright notices, appeals and counter-notices, and lists the copyright CSVs
- `stream-copyright-cases.mts` — Streams accepted copyright cases as the in-app participant projection shows them to a member
- `stream-copyright-incidents.mts` — Streams repeat-infringer incidents and decided reviews about the account
- `s3.mts` — S3 operations: upload ZIP, generate presigned download URL (1-hour default), and delete expired exports in serial S3 batches of at most 1,000 objects
- `get.mts` — Query request status and metadata, scoped to the requester so an admin-run export never reaches the subject; `wasDataRequestMadeBySubject` gates the ready email
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
| `copyright-*.csv`           | The account's own copyright filings in full, plus the participant view of its cases (six files)       |

## Copyright Records

Redaction rule: the export decrypts only what the account itself submitted as a signed-in user
(notices, appeals, counter-notices). Every other party's data comes from the participant projection
in `backend/services/copyright-notices/read-models.mts`, so it never holds another party's legal
name, address, contact, signature, staff rationale or raw email, and it omits delivery and outbox rows.
The rule is deliberately conservative and counsel confirms it under
[#1230](https://github.com/vouchington/vouchington/issues/1230). See
[account data export](../../../../requirements/users/ACCOUNT-DATA-EXPORT.md#copyright-records) for the exact files and
[copyright notices](../../../../requirements/moderation/COPYRIGHT-NOTICES.md#data-export) for the
owning rule.

`@services/copyright-notices` depends on `@services/users`, which depends on this package, so the
export mirrors the member projection SQL, the member timeline event list, and the
`copyright-form:` and `copyright-submission:` secret purposes instead of importing them. Tests in
`backend/api/v1/copyright-notices/data-export.test.mts` pin the mirror to the read model. A decrypt
failure fails the whole export rather than omitting a record, and the export worker therefore needs
the stored-secret encryption keys.

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

- S3 infrastructure: [docs/overview/architecture/backend/modules/aws/README.md](../../backend/modules/aws/README.md)
- Job queue (async export processing): [docs/overview/architecture/queues/account-data-requests/README.md](../../queues/account-data-requests/README.md)

Recovery selects one globally ID-ordered candidate page shared by deleted-owner terminalization and active-owner claims; their combined selected rows cannot exceed the configured batch size. Both mutations remove completed candidates, so later schedules advance across both streams. Recovery and expiration claims use configured bounded CTE pages with `FOR UPDATE SKIP LOCKED`. The expiration processor caps claimed pages per run and reports remaining work; durable state removes processed exports from the next scheduled claim.
