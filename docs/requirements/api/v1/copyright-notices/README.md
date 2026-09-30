# Copyright Notices API

Source entrypoint: [backend/api/v1/copyright-notices/README.md](../../../../../backend/api/v1/copyright-notices/README.md)

Structured US copyright notices use CAPTCHA or App Attest, rate limiting, UUID idempotency, and
server-resolved hosted image placements. EU and UK notices are separate routes and stay
unavailable until an administrator records an unwithdrawn territorial policy approval. Duplicate post and image pairs receive a validation error
before persistence. Signed-in and guest claimants may submit a notice, but only a deterministically
complete signed-in notice with a durable `not_obviously_invalid` anti-spam recommendation is
eligible for provisional restriction. The recommendation is not a legal merits
assessment and cannot fill a statutory field. A moderator must subsequently review every
provisional restriction.

`COPYRIGHT_INTAKE_ENABLED` is the intake kill switch. While it is off, or while the evidence
bucket, copyright sender and reply-to addresses, or media-delivery enforcement is unconfigured,
`POST /api/v1/copyright-notices`, `POST /api/v1/copyright-eu-notices`, and
`POST /api/v1/copyright-uk-notices` return `503` before authentication. New EU and UK notices need
this switch in addition to the territorial policy approval. In-case responses (appeals,
counter-notices, guest filings, EU and UK redress, EU supervised complaints) and every staff route
stay available so existing cases keep their statutory paths.

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

Accepted-case records are available to every signed-in member through `GET /api/v1/copyright-notices`.
The public projection includes a required nullable claimant profile with only the current public ID
and display label. It excludes legal identity, contact details, signatures, and participant details.
It uses the canonical opaque `after` cursor and bounded `limit` (1–100; default 100), returning
`page_info` so the member-visible index can continue beyond its first page.

The staff review queue uses the same bounded `after` and `limit` contract. Its cursor is scoped to
the actionable queue and orders by `(urgency, waiting_since, id)`: a missed restoration deadline
first, then a deadline past escalation, then all other open work, each oldest wait first. Every
queued case, including one whose only open item is a deadline past escalation, remains reachable
after the first page. Each item adds `reasons` (the distinct open-item kinds), `waiting_since` (the
oldest open item's time), and `next_deadline` (the earliest open deadline's `escalation_at` and
`restoration_deadline_at`, or null). Urgency is evaluated against the current time on each request,
so a case whose deadline passes between pages moves to an earlier tier.

The staff email intake queue, `GET /api/v1/copyright-email-intakes/review-queue`, uses the same
bounded `after` and `limit` contract with its own cursor scope. It orders unreviewed intakes by
immutable `(received_at, id)`, oldest first, so every email awaiting staff review remains
reachable after the first page. That includes an email whose parse was never recorded: its
`parse_status` is `unparsed`, beside `succeeded` and `failed`, and staff review it from the original
MIME object. A reviewer's decision refreshes the queue from its first page.

Staff repeat-infringer actions are separate from that queue payload.
`GET /api/v1/copyright-notices/:id/repeat-infringer-accounts` lists incidents for one case.
Reviewers record incident dispositions and warning or no-action review outcomes. Administrators
record restrict, terminate, and reinstatement. Restrict and terminate suspend the account.
Reinstatement does not unsuspend it.

Staff issue a one-case guest capability with `POST /api/v1/copyright-notices/:id/guest-capabilities`.
The expiry must be no more than 30 days after issue, and the token is returned only in that
response. `GET /api/v1/copyright-notices/:id/guest-capabilities` lists the case's capabilities
newest first with issuer, expiry, and revocation state, using the bounded `after` and `limit`
(1–100; default 25) contract with a case-scoped cursor; it never returns a token. Staff revoke one
with `POST .../guest-capabilities/:capabilityId/revocation` and record a request for more
information with `POST .../guest-capabilities/:capabilityId/information-requests`. A guest files
with `POST /api/v1/copyright-notices/:id/guest-filings` and the `Copyright-Guest-Capability`
header. A capability files at most one court or CCB hold (409 on a repeat), and a received
withdrawal revokes every live capability on the case.

## Performance

Mutation routes are uncached. An EU or UK receipt writes the notice, routing, and acknowledgment
obligation in one transaction, then records the acknowledgment in a second transaction. Review,
redress, and reporting mutations each use one transaction and do not read the US restoration
schedule. The staff email intake queue is private and uncached; each page is one read transaction
walking the `(received_at, id)` index. Notice creation resolves at most 20 image placements before
one legal aggregate transaction. Appeals and counter-notices use one bounded ownership query and
one transaction. Email approval resolves at most 20 placements, admits one aggregate, then imposes
target-scoped restrictions. A repeat-infringer account read is one query. A review outcome,
disposition, or reinstatement is one transaction. Restrict and terminate then call account
suspension. The guest capability list is private, uncached, and one primary-database query walking
the `(copyright_notice_id, id)` index. A guest filing locks its capability row, then appends the
filing and any withdrawal revocations in one transaction.
