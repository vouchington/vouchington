# @services/customer-support

Customer support backend services for managing contacts, threads, messages, and agent runs.

## What It Does

Provides all business logic for the customer support system: creating and retrieving support contacts, threads, and messages; tracking AI draft lifecycle (draft → approved → sent); and exposing full-text search for the RAG agent.

## Data Model

- **support_contacts** — individuals who contact support, identified by email. May be linked to a registered user via `user_id`.
- **support_threads** — one thread per support topic. Status is derived from lifecycle timestamps: `open` (no timestamps), `assigned` (`assigned_at IS NOT NULL`), `resolved` (`resolved_at IS NOT NULL`). Thread lifecycle actions write append-only `support_thread_lifecycle_changes` rows and update the current timestamp snapshot.
- **support_messages** — individual inbound/outbound messages within a thread, retained indefinitely. AI-generated draft messages use `drafted_at`/`approved_at`/`sent_at` timestamps backed by append-only `support_message_lifecycle_changes` rows.
- **support_inbound_email_message_ids** — unpartitioned registry that makes inbound email `Message-ID` values globally unique across support message partitions.
- **support_inbound_email_receipts** — durable SES receipt registry that makes S3 delivery retries idempotent even when an email has no RFC `Message-ID`; `customer_support_completed_at` records durable AI completion.
- **support_agent_runs** — tracks AI agent invocations for generating response drafts and retains them indefinitely. Inbound and member-created threads persist keyed intents before enqueueing; member IDs derive from the initial message, and scheduled reconciliation safely recovers delivery after a post-commit enqueue loss. A staff reservation locks its thread and blocks on unfinished SES receipt work or the latest inbound's active automatic run. A newer inbound message supersedes an unfinished staff reservation under the receipt → thread → run → message lock order; superseded runs are terminal rather than retryable failures, so a stale queued staff job cannot reanimate. If the staff draft committed first, the newer inbound receipt is completed without a competing automatic draft. Subject-only threads are not reservable because AI drafts require an inbound message for grounding. Failed and expired keyed work can be reclaimed without changing run identity, while the token fences stale finalizers and failures and completed work is terminal. Run status is derived from `completed_at`/`failed_at`.

Email addresses must be non-empty and normalized to lowercase. Message rows must
contain non-empty plain text or HTML content. Admin contact/thread search uses
trigram indexes, and inbound email threading uses a partial `email_message_id`
index for populated Message-ID headers.

When staff list threads, unresolved work is sorted by the support service level derived from the
linked contact's current membership: active or past-due Pro first, then active or past-due Plus,
then Free standard support. Resolved threads remain after unresolved work. This is staff inbox
ordering only. It does not set a response-time SLA or change AI queue priority. The derived
ordering value is internal to the staff query and is never serialized in support API responses.

Support levels are Free standard support, Plus priority, and Pro highest priority.

## Key Functions

| Module                                  | Functions                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts.mts`                          | `getOrCreateSupportContactByEmail`, `getSupportContactByEmail`, `getSupportContactById`, `getSupportContactsByIds`, `searchSupportContacts`, `updateSupportContact`, `linkSupportContactToUser` |
| `threads.mts`                           | `createSupportThread`, `createSupportThreadWithInitialMessage`, `getSupportThreadById`, `getSupportThreadsByContactId`, `assignSupportThread`, `resolveSupportThread`, `reopenSupportThread`    |
| `search-support-threads.mts`            | `searchSupportThreads` — paginated staff-inbox thread search with versioned cursors                                                                                                             |
| `create-inbound-support-message.mts`    | `createInboundSupportEmailMessage` — atomically reserve inbound email `Message-ID`, create contact/thread/message records, and enqueue post-commit work                                         |
| `create-support-message.mts`            | `createSupportMessage` — create inbound or outbound messages                                                                                                                                    |
| `create-support-draft-message.mts`      | `createSupportDraftMessage` — create AI-drafted outbound messages                                                                                                                               |
| `approve-support-message.mts`           | `approveSupportMessage` — set `approved_at`                                                                                                                                                     |
| `send-approved-support-message.mts`     | `sendApprovedSupportMessage` — set `sent_at`, trigger email                                                                                                                                     |
| `update-support-draft-message.mts`      | `updateSupportDraftMessage` — edit draft body before approval                                                                                                                                   |
| `get-support-messages-by-thread-id.mts` | `getSupportMessagesByThreadId` — paginated message list                                                                                                                                         |
| `get-support-message-by-id.mts`         | `getSupportMessageById`                                                                                                                                                                         |
| `search-messages.mts`                   | `searchSupportMessagesForRag` — full-text search for RAG agent                                                                                                                                  |
| `agent-runs.mts`                        | `createSupportAgentRun`, `claimKeyedSupportAgentRun`, `getSupportAgentRunById`, `updateSupportAgentRunOutput`, `updateSupportAgentRunError`                                                     |
| `finalize-keyed-support-agent-run.mts`  | `finalizeKeyedSupportAgentRun` — atomically persist one draft lifecycle and complete its keyed run                                                                                              |
| `authorization.mts`                     | `currentUserCanManageSupport`, `currentUserCanViewSupportThread`, `currentUserCanCreateSupportThread`                                                                                           |

## Authorization

- `currentUserCanManageSupport(currentUser)` — administrator role required for full support management.
- `currentUserCanViewSupportThread(currentUser, thread, contactUserId)` — admins or the contact's linked user can view a thread.
- `currentUserCanCreateSupportThread(currentUser)` — any authenticated user can open a support thread.

## Integration Points

- **Agent** (`@agents/customer-support`): `enqueueGenerateSupportResponse` (from `@queues/customer-support`) is called fire-and-forget after thread creation to trigger AI draft generation.
- **Job Queues** (`@queues/customer-support`): `enqueueEmbedSupportMessage` is called after each new message to generate vector embeddings for RAG search.
- **User support thread creation**: `createSupportThreadWithInitialMessage` creates the thread and optional initial inbound message in one transaction, then queues the support agent once after commit and the message embedding job when a message was persisted.
- **Emails** (`@queues/emails`): `sendApprovedSupportMessage` enqueues an outbound SES email after an admin approves a draft.
- **RAG Search**: `searchSupportMessagesForRag` performs full-text search over `search_vector` (generated tsvector) for use by the support agent when composing responses.
- **Inbound email deduplication**: `createInboundSupportEmailMessage` reserves the SES message ID in `support_inbound_email_receipts` and, when present, the trimmed RFC `Message-ID` in `support_inbound_email_message_ids`. Separate durable timestamps record the awaited embedding and agent enqueue legs. A retry enqueues only a missing leg, using the same per-message logical ID as both its GlideMQ `jobId` and deduplication ID. The keyed AI consumer anchors context to that message and atomically commits its one draft lifecycle with run completion.
- **Durable source**: SES stores unprocessed raw MIME in S3. After persistence, PostgreSQL receipts and messages remain the durable source for AI work. Every five minutes the `ses_inbound` reconciler scans both S3 `incoming/` and UUID-cursor pages of receipts without `customer_support_completed_at`; once before the first page, it converges marker-null receipts from completed keyed runs and the completed-run anti-join remains a safety check. Finalization writes enqueue and completion markers together, closing the worker-before-producer-marker race. Before bulk enqueue the reconciler removes only an exact, matching retained completed job ID; matching failed jobs are retried afterward. Manual and scheduled reconciliation share one GlideMQ ordering key at concurrency one. These columns are pre-launch schema, so no production backfill is required; completed-run repair and duplicate Message-ID processing populate missing markers transactionally.

## Keyed Agent Run State Machine

- Missing intent → `running`: insert one run for the unique `idempotency_key`.
- Live `running` → no claim: a fresh duplicate exits before provider work.
- Failed or reclaimable `running` → `running`: retain the run ID, rotate `claim_token`, refresh `started_at`, and clear output, error, termination, and terminal timestamps.
- `running` → `completed`: create or reuse the unique `agent_run_id` draft and write the authoritative persisted body to run output in one transaction.
- `running` → `failed`: record the error, then let the keyed queue delivery fail and consume its configured retry attempt. Unclaimed staff reservations use their `started_at` lease and retain `staff_draft_requested_at` as their durable staff-origin marker.
- `completed` → `completed`: terminal; stale failures and later claims cannot overwrite it.

A staff enqueue transport error leaves the unclaimed reservation active because acceptance is
ambiguous. The four-minute lease prevents an immediate competing reservation, then retry reuses the
same run and stable queue key.

## Related

- Full feature spec: [docs/requirements/admin/CUSTOMER-SUPPORT.md](../../../docs/requirements/admin/CUSTOMER-SUPPORT.md)
- Admin API: [backend/api/v1/admin/support/README.md](../../api/v1/admin/support/README.md)
- Inbound SES ingestion: [backend/workers/ses-inbound/README.md](../../workers/ses-inbound/README.md)
- AI agent: [backend/agents/customer-support/README.md](../../agents/customer-support/README.md)
- Job queue system: [backend/queues/customer-support/README.md](../../queues/customer-support/README.md)
