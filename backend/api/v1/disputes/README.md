# Disputes API

REST API for review disputes. Endpoints handle creation (captcha-gated), tiered reads, staff lifecycle (draft→approve→send), and resolution (remove/annotate/dismiss).

## Performance

- `GET /disputes` uses the shared opaque `after` cursor contract (max 100), scoped to status,
  staff-or-member audience, and the selected all-or-mine dataset; tiered redaction is computed in
  the service layer, not via separate queries.
- `POST /disputes` captcha verification is done inline before any DB write. Requests carrying valid Apple App Attest headers bypass the Turnstile requirement — see [App Attest bypass](../../../services/captcha/README.md#app-attest-bypass) in [`@services/captcha`](../../../services/captcha/README.md) (actionTag: `disputes.create`).
- `POST /disputes/:id/delivery` is the only notification path; it requires `approved_at` to be set, preventing race conditions.
