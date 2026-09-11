# @agents/customer-support

AI agent that generates support response drafts for customer threads.

## Purpose

When a new support thread is created (via web form or inbound email), this agent is invoked to draft an outbound response. The draft is saved as a `support_message` with `drafted_at` set, ready for an admin to review, edit, approve, and send.

The agent does not stream. It runs as a background job via `@queues/ai-agents`.

## Entry Point

`generateSupportResponse(threadId: string, options?): Promise<void>`

- Fetches the thread and up to 20 messages for context. Ordinary jobs use the latest window;
  keyed SES jobs use the inclusive window ending at their triggering message.
- Aborts if no inbound message exists (nothing to respond to).
- Runs a tool-use loop (up to `MAX_ITERATIONS = 5`) against the OpenAI Responses API.
- On completion, writes the response text as a draft `support_message` and records the agent run in `support_agent_runs`.

## Model

New runs use `gpt-5.4-nano` with `service_tier: 'flex'` and
`prompt_cache_key: 'support-agent-v1'`. Keyed jobs instead execute the model recorded in their
durable `support_agent_runs` intent; this worker only supports recorded `openai` providers and
fails a mismatched provider rather than silently producing an incorrectly attributed run.

## Tools

| Tool                      | Source                                  | Purpose                                  |
| ------------------------- | --------------------------------------- | ---------------------------------------- |
| `search_support_messages` | `@voucha/tools/search-support-messages` | Find how similar issues were handled     |
| `search_posts`            | `@voucha/tools/search-posts`            | Search community discussions and reviews |
| `search_rss_feed_items`   | `@voucha/tools/search-rss-feed-items`   | Search articles from RSS feeds           |

Tools run with the `customer-support` system user. That user has the `customer_support` role and
must not have the `administrator` role. Tools that require support-only context explicitly allow
`customer_support`; generic search tools continue to use normal user-scoped filtering.

## System Prompt Guidance

The system prompt (`SUPPORT_AGENT_SYSTEM_PROMPT` in `build-system-prompt.mts`) instructs the agent to:

- Use tools to find relevant context before drafting a response.
- Be empathetic, professional, and concise.
- Cite community discussions or articles when relevant.
- Never fabricate information — only use what tools return or what is in the thread context.
- Produce a complete, standalone response ready for admin review and sending.

## Execution Mode

Non-streaming. Runs as a background job dispatched by `enqueueCustomerSupportAwaited` from
`@queues/ai-agents`. The caller logs all errors; keyed jobs rethrow the original failure after
recording it so GlideMQ attempts remain effective.

## Agent Run Tracking

Every invocation creates a `support_agent_runs` record with:

- `input`: `{ thread_subject, message_count }`
- `output`: `{ response, iterations }` on success
- `error`: error message on failure
- `termination_reason`: `no_tool_calls` (normal exit), `max_iterations`, `stalled`, or `error`
- `completed_at`/`failed_at`: lifecycle timestamps used to derive run status
- misconfigured agent service-user authorization failures are recorded as run errors

SES inbound jobs carry their triggering support-message ID and stable logical intent. A single
same-thread SQL query returns at most 20 messages through that exact inbound message, inclusive,
so a delayed job still includes its trigger and excludes every later message. Rapid messages
therefore create distinct anchored jobs. The unique run is
claimed before model work with a four-minute `started_at` lease. Completed runs are terminal. A
failed run is atomically reclaimed with the same ID and cleared terminal state; an expired lease or
the stable delivery's explicit retry may also reclaim running work, while a live fresh duplicate
does no model work. Successful keyed finalization creates or reuses the draft and completes the run
in one PostgreSQL transaction. The persisted draft body is authoritative for `output.response`,
including orphan-draft replays whose new model attempt returns different or empty text.
Member-created support threads also persist a keyed intent before enqueueing, using the initial
message ID as its stable logical job ID so reconciliation can replay a lost post-commit enqueue.
That intent's OpenAI model/provider are the audit record used when the recovered job executes.

## Related

- Job queue trigger: [`backend/queues/customer-support/README.md`](../../queues/customer-support/README.md)
- Service layer: [`backend/services/customer-support/README.md`](../../services/customer-support/README.md)
- Feature spec: [`docs/requirements/admin/CUSTOMER-SUPPORT.md`](../../../docs/requirements/admin/CUSTOMER-SUPPORT.md)
