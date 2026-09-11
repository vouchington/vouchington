# CRM Outreach Agent

AI agent that drafts personalized outreach emails for CRM contacts.

## How It Works

1. Receives contact record (name, email, vertical, follower count, social handles)
2. Uses `search-posts` and `search-rss-feed-items` tools to find relevant articles/content
3. Calls OpenAI Responses API to generate a personalized email draft
4. Returns `{ subject, body_html, body_text }`

The agent is **synchronous** — the admin waits for the draft inline (not queued).

## Functions

| Function                | File                    | Description                                   |
| ----------------------- | ----------------------- | --------------------------------------------- |
| `draftCrmOutreachEmail` | draft-email.mts         | Main entry: generates an outreach draft       |
| `buildSystemPrompt`     | build-system-prompt.mts | Constructs system prompt with contact context |

## Parameters

- `currentUser` — admin making the request
- `contact` — CRM contact record with social accounts
- `options.prompt` — optional additional instructions
- `options.tone` — optional tone guidance (e.g., "friendly", "professional")

`prompt`, `tone`, and fallback contact-name input are sanitized and wrapped before being passed to
the model. Contact profile data in the system prompt is also sanitized and wrapped by
`build-system-prompt.mts`.

## Tools Used

- `search-posts` — finds relevant posts/discussions on the platform
- `search-rss-feed-items` — finds relevant RSS articles for the contact's vertical

## Related

- API endpoint: [../../api/v1/admin/crm/README.md](../../api/v1/admin/crm/README.md)
- CRM contacts service: [../../services/crm-contacts/README.md](../../services/crm-contacts/README.md)
- Chat agent (pattern reference): [../chat/](../chat/)
