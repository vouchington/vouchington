# Bluesky account linking

[Back to Sessions & Authentication API](README.md#bluesky-account-linking)

Every begin request creates a durable authorization record. Web callbacks require the same
authenticated Voucha user who began the authorization. Native begin requests additionally send
`completion_proof_challenge`, the 43-character base64url SHA-256 challenge for a verifier retained
by the app. The native completion request sends `flow_id`, the one-time `completion_token`, and
`completion_proof_verifier`; bearer-token possession alone cannot attach the account.

The callback state carries only the authorization ID. Ownership, mode, status, DID claim, proof,
and expiry are loaded from PostgreSQL, and every later mutation must match that exact generation.
See the [Bluesky account lifecycle threat model](../../../services/bluesky-accounts/README.md#lifecycle-threat-model).

`POST /api/v1/auth/bluesky/link` and `POST /api/v1/auth/bluesky/link-completions` validate their
request body against the generated contract after `requireAuth`/`assertNotSuspended` and before the
manual mode/field pairing checks below — see
[Request Validation](reference-request-validation.md#precondition-then-schema-ordering).
