# Customer Support reference

[Back to Customer Support](CUSTOMER-SUPPORT.md)

## Overview

The customer support system lets users submit support requests through a web form, receive email-based replies, and follow their ticket status. Admins manage threads from a dedicated admin panel with AI-assisted draft responses, human approval, and email sending via Amazon SES.

Key properties:

- **Email-based communication**: both inbound (user → support) and outbound (support → user) messages are tracked as emails
- **AI draft responses**: when a new thread is created, an AI agent drafts a response for the admin to review and send
- **Human approval workflow**: AI drafts must be approved by an admin before sending; admins can also edit the draft body
- **Explicit conversation privacy**: regular chat conversations are never visible to admins unless the user explicitly links the conversation when creating a support thread

---

## Status Lifecycle

Threads progress through three states, derived from lifecycle timestamps (not a status column):
Thread lifecycle actions are recorded in append-only `support_thread_lifecycle_changes` rows, with
current timestamp snapshots kept on `support_threads` for filtering and display.

| Status     | Condition                                        |
| ---------- | ------------------------------------------------ |
| `open`     | No `assigned_at`, no `resolved_at`               |
| `assigned` | `assigned_at IS NOT NULL`, `resolved_at IS NULL` |
| `resolved` | `resolved_at IS NOT NULL`                        |

State transitions:

- **Open → Assigned**: admin clicks "Assign to Me" (`PATCH` thread with `{ assigned_to_id }`)
- **Any → Resolved**: admin clicks "Resolve" (`PATCH` thread with `{ resolved: true }`)
- **Resolved → Open**: admin clicks "Reopen" (`PATCH` thread with `{ resolved: false }`)

Resolved threads are read-only for outbound work. Staff must reopen a thread before saving a reply or
requesting an AI draft. An open or assigned thread has at most one queued or running staff-requested
draft generation; an unsent AI draft must be approved and sent before another can be requested.

---

## Conversation Privacy

Chat conversations are **not** automatically shared with or visible to support admins.

- Regular `conversations` table rows are owned by individual users and are inaccessible to admins through the support system.
- A conversation is linked to a support thread **only** if the user explicitly provides a `conversation_id` when creating the thread (via `/chat/support/new?conversation_id=<id>`).
- The support-thread API validates that `conversation_id` is a valid UUID for an existing, non-deleted conversation owned by the submitting user. Malformed IDs return `400`; missing or not-owned valid IDs return `404`.
- The `conversation_id` field on `support_threads` is optional (nullable). Its presence indicates the user consented to sharing that specific conversation for support context.
- `POST /api/v1/my/support-threads` accepts an optional `message` field. When present as a non-empty string, the API trims and stores it as the first inbound support message, returns both `{ thread, message }`, and enqueues the support-agent job once after commit plus the embedding job for the persisted message. Blank strings are treated as absent; non-string values return `400`.
- Admins with the `administrator` role can read, update, and delete a conversation **only** when a `support_threads` row links that conversation (explicit user opt-in at support-thread creation time). The `/api/v1/agents/:idOrSlug/conversations*` endpoints return only consent-linked conversations.
- Coverage is tracked in the [User Privacy Feature Matrix](../users/USER-PRIVACY-MATRIX.md).

---
