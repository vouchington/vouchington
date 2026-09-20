# Copyright Notices API

Structured copyright notices use CAPTCHA or App Attest, rate limiting, UUID idempotency, and
server-resolved hosted image placements. Signed-in and guest claimants may submit a notice, but only
a deterministically complete signed-in notice with a durable `not_obviously_invalid` anti-spam
recommendation is eligible for provisional restriction. The recommendation is not a legal merits
assessment and cannot fill a statutory field. A moderator must subsequently review every
provisional restriction.

Browser clients must send a Cloudflare Turnstile token in `cf_turnstile_response` for every
copyright notice, appeal, and counter-notice submission. Native iOS clients may instead use the
equivalent verified App Attest assertion path with the endpoint's action tag; browser clients do
not have that attestation path. The server rejects an incomplete or invalid App Attest attempt
rather than falling back to CAPTCHA.

Signed-in affected posters may submit an informal appeal or a separate statutory counter-notice.
Both flows require CAPTCHA, exact case targets, and server-verified ownership. Email intake approval
is staff-only and cannot create a case until a moderator supplies and approves the structured fields. Matched
replies use `POST /api/v1/copyright-email-intakes/:id/correspondence` for staff classification; the original MIME
remains attached and no agent, restriction, or outbound message runs automatically.

## Performance

Mutation routes are uncached. Notice creation resolves at most 20 image placements before one legal
aggregate transaction. Appeals and counter-notices use one bounded ownership query and one
transaction. Email approval resolves at most 20 placements, admits one aggregate, then imposes
target-scoped restrictions.
