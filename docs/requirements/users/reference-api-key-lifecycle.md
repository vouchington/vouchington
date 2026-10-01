# API key expiry and rotation

[Back to API keys](api-keys.md).

`POST /api/v1/my/api-keys` accepts `lifetime_days`: `30`, `90`, `365`, or `null` (no expiry).
Omitting it selects 90 days for ordinary owners and 30 days for owners with the administrator role.
Administrators may select only 30 or 90 days. Explicit unlimited or over-90-day requests return
`400`; invalid request shapes return `422`. Other users may select any offered lifetime.

Owner-only list/create/rotation responses include nullable `expires_at`, `replaced_by_api_key_id`,
and `expiry_reminder_sent_at`. Expired and revoked keys produce the same authentication rejection
for user MCP and RSS. An administrator-owned key without expiry, or with a lifetime exceeding
90 days from its creation, also fails that check, including after role promotion. Validation and
usage timestamp updates both check current role and expiry.

`POST /api/v1/my/api-keys/:id/rotate` creates a replacement and returns `201` with
`{ api_key, raw_key }`. The owner lock, replacement insert, old-key link, and old expiry update are
one transaction. The replacement preserves type, label, permissions, and original lifetime.
For an administrator rotating an unlimited or over-90-day key, it receives the 30-day default.
The old deadline becomes the earlier of its existing expiry and 24 hours from rotation. It is
never extended. An expired, revoked, or already-replaced key returns `409`; an absent or another
owner's key returns `404`. A replacement may itself be rotated.

The web manager displays expiry, expired/replaced state, and the one-time replacement key. It
prompts administrators with invalid keys to rotate or revoke them. Native expiry/rotation controls
remain a client-parity dependency under #1270. The dependent native draft is tracked by [clients#197](https://github.com/vouchington/vouchington-clients/issues/197).

An hourly sweep queues reminders for active, unreplaced keys within seven days of expiry. The
sender resolves the owner's current verified address and claims `expiry_reminder_sent_at` just
before sending a classified transactional email. Concurrent jobs and retries cannot send twice.
A crash or uncertain provider outcome after the claim can lose the reminder; it is not resent,
matching the renewal notification's no-duplicate boundary. Keys remain usable until their expiry
regardless of reminder delivery. Missing verified addresses remain eligible for later sweeps.
