# OpenAI Moderation

Source entrypoint: [backend/services/openai-moderation/README.md](../../../../../backend/services/openai-moderation/README.md)

## Acceptance Criteria

### API Chat Text Moderation

- `createOpenAIModeration(texts, undefined, { idempotencyKey })` remains the single provider boundary
  for chat text moderation when a caller needs to forward an external idempotency key.
- API callers invoke it in-process. Its provider-scoped egress flag selects the guarded direct
  transport or HTTP CONNECT proxy without changing the moderation operation.
- Prompt-injection detection and `PROMPT_INJECTION` / `MODERATION_VIOLATION` HTTP policy errors are
  owned by `checkMessageSafety()` in this service (see [Chat Message Safety](#chat-message-safety)),
  not by the worker handler. The API safety adapter only supplies the routed provider call.

### Chat Message Safety

`checkMessageSafety(message, { createTextModeration })` in `message-safety.mts` is the shared guard
for a user chat message. It lives here, next to the provider boundary, so callers do not import the
API's package.

1. **Pattern detection** — regexes for common prompt-injection phrases throw a 400 with code
   `PROMPT_INJECTION` before any provider call.
2. **Text moderation** — a flagged result throws a 400 with code `MODERATION_VIOLATION` and the
   flagged `categories`. An empty result list is treated as not flagged.

The provider call is injected as a `CreateTextModeration` capability and defaults to
`createOpenAIModeration`. The API's `checkApiMessageSafety()` injects its own capability (with
`apiSafetyCheck` and a per-call idempotency key); a caller that injects nothing uses the default
provider.

### Post Moderation

- Use OpenAI's `omni-moderation-latest` model to moderate post content
- Moderate both text content and image URLs
- For uploaded images, pass OpenAI an image-resize Lambda URL (`/images/{env}/{s3_key}`), not a
  private S3 object URL, so dev/test can fetch through the local Lambda service and deployed
  environments can fetch through the public image route.
- Skip moderation if there is no content to moderate (no text or images)
- Reuse existing moderation results if content SHA256 matches (avoid duplicate API calls)
- Store moderation results, flagged status, content SHA256, and timestamp in `posts` table
- Read stored raw results through `getStoredPostOpenAIModeration()` only after the caller has
  authorized access; general post views do not expose provider moderation details.
- Ensure content hasn't changed between moderation request and result application (optimistic concurrency)

### Moderation Process

1. Create moderation content from post (text + image URLs)
2. Calculate content SHA256 hash
3. Check if moderation is up-to-date for this content
4. If not up-to-date, search for existing moderation with same content hash
5. If existing moderation found, reuse results
6. If no existing moderation, call OpenAI moderation API
7. Apply results to post (with optimistic concurrency check)

### Data Integrity

- Use content SHA256 to:
  - Deduplicate moderation API calls for identical content
  - Verify content hasn't changed between request and storage
  - Enable moderation result reuse across different posts with same content

## Related

- [Community moderation results](../../../../requirements/moderation/reference-community-moderation-api-routes.md#get-apiv1communitiesslugpostspostidmoderation-results)
- Real OpenAI integration tests: `pnpm run test:backend:openai` with `OPENAI_API_KEY`
- System: [../../queues/openai-moderation/](../../queues/openai-moderation/README.md) - Moderation job queue
- Posts Service: [../posts/AGENTS.md](../../../../../backend/services/posts/AGENTS.md)
- Entity Listeners: [../../queues/entity-listeners/README.md](../../queues/entity-listeners/README.md)
- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
