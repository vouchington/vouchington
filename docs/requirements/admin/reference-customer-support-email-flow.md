# Customer Support reference

[Back to Customer Support](CUSTOMER-SUPPORT.md)

## Email Flow

### Inbound (user email → support thread)

1. User sends email to the support address.
2. Google Workspace routes the support address to the SES inbound subdomain.
3. SES stores the raw MIME message under the private S3 `incoming/` prefix.
4. An S3 notification delivers the SES message ID and object key via SQS to a worker consumer, which enqueues them to `ses_inbound` (`vouchington-infra/opentofu/ses-inbound.tf`, `backend/workers/ses-inbound-sqs`).
5. The backend worker reserves the SES message ID and optional RFC `Message-ID` before creating side effects.
6. A new `support_thread` is created, or an existing thread is found from `In-Reply-To` / `References` email headers.
7. The email body is saved as an inbound `support_message`, and the reserved `Message-ID` is completed with the thread/message IDs.
8. The worker awaits AI draft generation and embedding enqueues, completes the durable receipt, and deletes the raw S3 object.
9. A five-minute reconciler re-enqueues anything left under S3 `incoming/` and pages PostgreSQL for persisted inbound messages without a completed keyed agent run; terminal MIME failures move to `failed/`.

### Outbound (support → user email)

1. Admin reviews the thread in the admin panel.
2. Admin clicks "Generate AI Draft" → `POST /api/v1/support/threads/:id/drafts` → enqueues `generateSupportResponse`.
3. The AI agent runs, calls tools (`search_support_messages`, `search_posts`, `search_rss_feed_items`), and writes a draft `support_message` (`drafted_at` set, `sent_at` null).
4. Admin reviews the draft in the admin panel; optionally edits it (`PATCH /api/v1/support/threads/:id/messages/:msgId`).
5. Admin approves the draft (`POST …/approvals`), setting `approved_at`.
6. Admin sends the approved message (`POST …/sends`), which calls SES and sets `sent_at`.

---

## Authorization Model

| Endpoint Group                         | Who can access                         |
| -------------------------------------- | -------------------------------------- |
| `GET/POST /api/v1/my/support-threads*` | Any authenticated user (own data only) |
| `GET/POST/PATCH /api/v1/support/*`     | Administrator role only                |

### User-facing authorization

- `currentUserCanCreateSupportThread(currentUser)` — any authenticated user
- `currentUserCanViewSupportThread(currentUser, thread, contactUserId)` — the contact's linked user, or an admin

### Admin authorization

- `currentUserCanManageSupport(currentUser)` — `administrator` role required for all admin endpoints

### AI agent authorization

- The background customer support agent runs as the `customer-support` system user with the
  `customer_support` role, not as an administrator.
- Support-agent tools that need prior support-message context explicitly allow the
  `customer_support` role while remaining unavailable to generic users.

---

## AI Draft Workflow

1. **Trigger**: Thread creation or admin manually queuing a draft via `POST …/drafts`.
2. **Agent**: `@agents/customer-support` → `generateSupportResponse(threadId)`.
3. **Context**: Agent receives the thread subject and last 20 messages as conversation history.
4. **Tools**: Agent iteratively calls tools (up to `MAX_ITERATIONS = 5`) to gather context:
   - `search_support_messages` — find similar resolved issues
   - `search_posts` — search community discussions and reviews
   - `search_rss_feed_items` — search articles from RSS feeds
5. **Output**: A complete draft response string saved as an outbound `support_message` with `drafted_at` set.
6. **Agent run record**: `support_agent_runs` tracks input, output, termination reason, and errors.
   Keyed inbound jobs lease and reuse one run, anchor context to their triggering message, and use
   the run ID as the draft's unique idempotency identity. Failed runs return to running with cleared
   terminal state; draft creation/reuse and successful run completion commit atomically, and
   completed runs are terminal.
7. **Admin review**: The admin reviews the draft in the thread detail view, optionally edits it, approves, and sends.

---
