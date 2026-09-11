# POST /api/v1/my/import/topics

[Back to My API](README.md#post-apiv1myimporttopics)

Accepts a JSON body with a `names` array. The encoded body is limited to 2 MiB and each request may
contain at most 500 non-empty topic names.

Clients send one UUID `Idempotency-Key` per unchanged ordered import batch. The server retains the
complete response for 48 hours, so a lost-response retry returns the exact original statuses even
if topic or follow state later changes. Reusing the key for different input returns `409
IDEMPOTENCY_KEY_REUSED`. The server also derives a stable child admission key for each missing
normalized slug, so a pending outer attempt resumes without duplicating its recommendations.

If any recommendation for the batch is still being processed, the endpoint returns `409
CONTRIBUTION_ADMISSION_IN_PROGRESS` with `Retry-After` for the whole batch. Clients retry the
unchanged batch with the same outer key; a successful `200` response never hides this transient
state as an item-level error. Audits for recommendations completed before the held item are saved
before the `409`. Existing-topic follows wait until every recommendation can settle, then the
follow relations and their import audits commit atomically. An audit-write failure rejects the
request so the client retains the same retry identity. Headerless compatibility requests receive a
server-generated, unreplayable outer identity; once a recommendation commits, they return its
durable result rather than a retryable `409` that would create a different import identity.
