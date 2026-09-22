# Customer Support reference

[Back to Customer Support](CUSTOMER-SUPPORT.md)

## Data Model

### `support_contacts`

Represents an individual who contacts support, identified by email address.

| Column       | Description                       |
| ------------ | --------------------------------- |
| `id`         | UUIDv7 primary key                |
| `email`      | Contact's email address (unique)  |
| `name`       | Display name (optional)           |
| `user_id`    | Linked registered user (optional) |
| `notes`      | Admin-only notes                  |
| `created_at` | Creation timestamp                |
| `updated_at` | Last update timestamp             |

### `support_threads`

One thread per support topic.

| Column            | Description                                 |
| ----------------- | ------------------------------------------- |
| `id`              | UUIDv7 primary key                          |
| `contact_id`      | FK → `support_contacts`                     |
| `subject`         | Thread subject                              |
| `conversation_id` | Optional FK → `conversations` (user-shared) |
| `assigned_to_id`  | FK → `users` (assigned admin)               |
| `assigned_at`     | Timestamp of assignment                     |
| `resolved_at`     | Timestamp of resolution                     |
| `resolved_by_id`  | FK → `users` (admin who resolved)           |
| `created_at`      | Creation timestamp                          |
| `updated_at`      | Last update timestamp                       |

`support_thread_lifecycle_changes` stores append-only assignment, resolution, and reopen
transitions for each thread.

### `support_messages`

Individual messages in a thread. They remain unpartitioned while thread and full-text indexes are
selective; the schema-growth registry requires reconsideration after measured growth pressure.

| Column              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `id`                | UUIDv7 primary key                                        |
| `support_thread_id` | FK → `support_threads`                                    |
| `agent_run_id`      | Optional unique FK for idempotent AI draft creation       |
| `direction`         | `inbound` (user → support) or `outbound` (support → user) |
| `body_text`         | Plain text message body                                   |
| `email_message_id`  | Email `Message-ID` header for inbound threading           |
| `from_email`        | Sender email address                                      |
| `to_email`          | Recipient email address                                   |
| `ses_message_id`    | AWS SES message ID (for sent/received tracking)           |
| `drafted_at`        | Timestamp when AI draft was generated                     |
| `approved_at`       | Timestamp when admin approved the draft                   |
| `approved_by_id`    | FK → `users`                                              |
| `sent_at`           | Timestamp when message was sent                           |
| `sent_by_id`        | FK → `users`                                              |
| `search_vector`     | `tsvector` for full-text RAG search                       |
| `embedding`         | `vector(1024)` for semantic similarity search             |
| `created_at`        | Creation timestamp                                        |

Draft, approval, edit, and send transitions are stored in append-only
`support_message_lifecycle_changes` rows. The timestamp columns on `support_messages` are the current
snapshot used for filtering and display.

Inbound email `Message-ID` values are reserved in the `support_inbound_email_message_ids` registry before the message row is created. This keeps inbound email handling idempotent: a duplicate inbound `Message-ID` is acknowledged and ignored without creating another thread, message, embedding job, or AI draft job. Support messages are intentionally unpartitioned so thread pagination and global full-text/vector search share one indexable table.

### `support_agent_runs`

Tracks AI agent invocations for generating response drafts. The table is intentionally unpartitioned and retained indefinitely with the rest of support history.

| Column                     | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `id`                       | UUIDv7 primary key                                                     |
| `support_thread_id`        | FK → `support_threads`                                                 |
| `support_message_id`       | FK → triggering inbound message                                        |
| `idempotency_key`          | Optional unique logical intent for leased inbound or member queue work |
| `staff_draft_requested_at` | Set while a staff-requested draft reservation is queued or running     |
| `model_name`               | LLM model identifier                                                   |
| `model_provider`           | Provider (e.g., `openai`)                                              |
| `input`                    | JSON input context                                                     |
| `output`                   | JSON output (response text, iterations)                                |
| `termination_reason`       | `no_tool_calls`, `max_iterations`, `stalled`, `superseded`, `error`    |
| `error`                    | Error details if the run failed                                        |
| `created_at`               | Creation timestamp                                                     |
| `completed_at`             | Terminal completion timestamp, including superseded runs               |
| `failed_at`                | Failure timestamp                                                      |

The partial unique index on active staff draft reservations permits one queued or running request per
thread. An unclaimed reservation is reclaimed with its stable logical ID after four minutes, while
unfinished inbound-email receipt work or an active automatic run for the latest inbound message
blocks a competing staff request. Member-created threads persist their keyed intent with the initial
message before enqueueing; scheduled reconciliation recovers a delivery lost after commit. A failed
staff enqueue leaves its unclaimed reservation active because queue acceptance is ambiguous; after
the four-minute lease, retry reuses the same run and idempotency key.

When a newer inbound email is persisted for the thread, its receipt transaction locks the receipt,
thread, then active staff run before creating the inbound message. An unfinished staff reservation
is completed with terminal `superseded` rather than retryable `error`, so its delayed queue job
cannot reclaim or finalize it. If the staff draft completed before that lock was acquired, the
newer receipt records its automatic draft leg as completed and does not create a competing draft.
An automatic run for an older inbound message makes the same comparison while it holds that
message's receipt then the thread; if newer inbound context exists, it terminally supersedes itself
and completes its own receipt before it can create a draft.

---
