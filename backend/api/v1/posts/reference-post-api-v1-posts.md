# POST /api/v1/posts

[Back to Posts API](README.md#post-apiv1posts)

Creates a new post. Requires authentication.

## Admission and idempotency

During the migration window, clients may send an `Idempotency-Key` UUID header for authored creates.
Keep it unchanged while retrying the same canonical request after a lost response. A matching replay
returns the original creation result. A key reused for different input returns 409
`IDEMPOTENCY_KEY_REUSED`; a request still being admitted returns 409
`CONTRIBUTION_ADMISSION_IN_PROGRESS` with `Retry-After`. Capacity rejection returns 429. These
responses intentionally do not reveal quota thresholds, Safety policy, or moderation state.

The server accepts callers without the header during migration by assigning a non-replayable identity.
New clients must send the header; once the clients #92 handoff is adopted, the compatibility fallback
will be removed.

Admin-created posts are trusted on create: the response post is returned with
derived `clearance_status='approved'`, and the create path skips automated moderation, moderator-agent
dispatch, community moderation, and spam detection. Non-admin posts still start as `pending` and
flow through the normal automated clearance pipeline.

**Honeypot:** If `hp_website` or `hp_phone` fields are non-empty, returns a fake `201 { post: { id, post_type, ... } }` without creating a real post (bot detection — see [`@services/honeypot`](../../../services/honeypot/README.md)).

**CAPTCHA:** Requires a Cloudflare Turnstile token in `cf_turnstile_response`. After admission has
resolved replay, mismatch, or an existing live claim, only the newly claimed request calls
`verifyCaptchaOrAttestation` (see [`@services/captcha`](../../../services/captcha/README.md)) — `422`
if the token is missing, `400` if Cloudflare rejects it, `502` if siteverify is unreachable. The
same applies to comment creation (which uses this endpoint with `post_type: 'comment'`). Requests
carrying valid Apple App Attest headers bypass this Turnstile requirement — see [App Attest
bypass](../../../services/captcha/README.md#app-attest-bypass) in `@services/captcha` (actionTag:
`posts.create`).
