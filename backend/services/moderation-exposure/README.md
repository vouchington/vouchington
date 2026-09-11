# Moderator media exposure

The service records sensitive-media reveals in `moderation_media_reveals`, counts distinct entities
inside the rolling exposure window, and calculates the advisory cooldown state when the configured
threshold is crossed.

`POST /api/v1/moderation/reveals` remains restricted to platform moderation staff. It validates
optional post and report IDs, writes the reveal, and reads the returned exposure state through the
same writer transaction. This guarantees that a successful response includes the reveal that was
just recorded.

`GET /api/v1/moderation/exposure` is available to every authenticated user and reads from the
primary database so hydration and cooldown-expiry refreshes cannot lag behind a successful reveal.
The cooldown is a client wellbeing policy, not a server authorization boundary: unrelated
moderation mutations are never rejected because of exposure state.

Reveals are deduplicated by post ID, then report ID, and finally reveal-row ID when neither entity
ID is supplied. Retrying the same entity is therefore safe for threshold counting.
