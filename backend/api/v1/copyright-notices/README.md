# Copyright Notices API

Structured copyright notices use CAPTCHA or App Attest, rate limiting, UUID idempotency, and
server-resolved hosted image placements. Signed-in and guest claimants may submit a notice, but only
a signed-in notice with a durable `clear` anti-spam recommendation is eligible for provisional
restriction. A moderator must subsequently review every provisional restriction.

Signed-in affected posters may submit an informal appeal or a separate statutory counter-notice.
Both flows require CAPTCHA, exact case targets, and server-verified ownership. Email intake approval
is staff-only and cannot create a case until a moderator supplies and approves the structured fields.

## Performance

Mutation routes are uncached. Notice creation resolves at most 20 image placements before one legal
aggregate transaction. Appeals and counter-notices use one bounded ownership query and one
transaction. Email approval resolves at most 20 placements, admits one aggregate, then imposes
target-scoped restrictions.
