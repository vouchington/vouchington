# Copyright Notices API

Source entrypoint: [backend/api/v1/copyright-notices/README.md](../../../../../backend/api/v1/copyright-notices/README.md)

Structured US copyright notices use CAPTCHA or App Attest, rate limiting, UUID idempotency, and
server-resolved hosted image placements. A target is a closed union on `surface`: `post-image` uses
`post_id`; `user-profile-image` uses `user_id`; `user-profile-link-image` uses
`user_profile_link_id`; topic logo/hero kinds use `topic_id`; community profile/banner kinds use
`community_id`. Every branch includes `image_id` and informational `target_url`. The resolver
recomputes the canonical URL. A claimant names a target only if that claimant could view it at
submission. A hidden target receives the same `422` as a missing one. Staff approval of an emailed notice
is not gated by viewability and resolves any existing hosted placement. EU and UK notices are
separate routes and stay
unavailable until an administrator records an unwithdrawn jurisdiction policy approval. Duplicate
`(surface, owner, image)` selections receive a validation error
before persistence. Signed-in and guest claimants may submit a notice, but only a deterministically
complete signed-in notice with a durable `not_obviously_invalid` anti-spam recommendation is
eligible for provisional restriction; any non-post target refuses automation with `non_post_target`. The recommendation is not a legal merits
assessment and cannot fill a statutory field. A moderator must subsequently review every
provisional restriction.

`COPYRIGHT_INTAKE_ENABLED` is the intake kill switch. While it is off, or while the evidence
bucket, copyright sender and reply-to addresses, or media-delivery enforcement is unconfigured,
`POST /api/v1/copyright-notices`, `POST /api/v1/copyright-eu-notices`, and
`POST /api/v1/copyright-uk-notices` return `503` before authentication. Staff approval of an
emailed notice, `POST /api/v1/copyright-email-intakes/:id/approvals`, returns the same `503` because
it opens a new case. New EU and UK notices need this switch in addition to the jurisdiction policy
approval. In-case responses (appeals, counter-notices, guest filings, EU and UK redress, EU
supervised complaints) and every other staff route stay available so existing cases keep their
statutory paths. Email is still ingested and listed in the staff email intake queue while the switch
is off, and staff can reject an email or record a matched reply through
`POST /api/v1/copyright-email-intakes/:id/correspondence`.

Browser clients must send a Cloudflare Turnstile token in `cf_turnstile_response` for every
copyright notice, appeal, and counter-notice submission. Native iOS clients may instead use the
equivalent verified App Attest assertion path with the endpoint's action tag; browser clients do
not have that attestation path. The server rejects an incomplete or invalid App Attest attempt
rather than falling back to CAPTCHA.

The notice, appeal, and counter-notice bodies are closed: an unknown key, or a `cf_turnstile_response`
that is not a string, is a `422` before any service call, and each statutory declaration must be the
literal `true`. Existing field-named `422` messages and the `Idempotency-Key` `400` are unchanged;
see [request validation](../../reference-copyright-submission-request-validation.md).

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

The detail's `timeline` is an audience allowlist: a member sees only case-facing events (notice
received, provisional restriction imposed, placement withheld and restored, appeal and
counter-notice received and reviewed, withdrawal received) and never internal review, replay,
legal-hold, or guest-capability events. `GET /api/v1/copyright-notices/:id/participant` gives a
claimant or affected poster the same case-facing events and gives staff the unfiltered timeline.
Its required `statements` array contains only that participant's immutable outgoing email statements:
`id`, `delivery_kind`, nullable `sent_at`, and stored `text`. Staff receive `[]`; erased bodies are
omitted. The public member projection has no statements. An unaccepted notice never opens a
participant case, including for its notifier; its in-app decision links to the notification inbox.

The staff review queue uses the same bounded `after` and `limit` contract. Its cursor is scoped to
the actionable queue and orders by `(urgency, waiting_since, id)`: a missed restoration deadline
first, then a deadline past escalation or an unassessed court or CCB filing, then all other open work, each oldest wait first. Every
queued case, including one whose only open item is a deadline past escalation, remains reachable
after the first page. Each item adds `reasons` (the distinct open-item kinds), `waiting_since` (the
oldest open item's time), and `next_deadline` (the earliest open deadline's `escalation_at` and
`restoration_deadline_at`, or null). Urgency is evaluated against the current time on each request,
so a case whose deadline passes between pages moves to an earlier tier.

While `copyright.staydownMatching` is on, an upload that matches an image a moderator confirmed on
a case adds the `staydown_review` reason to that case. Each item's `staydown_matches` lists its
unreviewed matches: `id`, `match_kind` (`exact` or `perceptual`), `hamming_distance` (differing
bits of 64; 0 for an exact match), `registered_image_id`, the matching `image_id` (the registered
image itself for an exact match, because a byte-identical re-upload resolves to the existing image),
`uploaded_by_id`, and `matched_at`.
The list is empty while the switch is off. A moderator marks one reviewed with
`POST /api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews`, which returns
`{ reviewed: boolean }` (`false` when already reviewed) and `404` for a match that belongs to a
different case. The match never blocks the upload; see
[staydown matching](../../../moderation/COPYRIGHT-NOTICES.md#staydown-matching).

A queued item's `form_review` returns the intake's screening and advisory guidance whether or not a
moderator has decided it. Its `review` is null until then, and afterwards `{ accepted, reviewed_at,
reviewed_by_id }` with a null `reviewed_by_id` once the reviewer's account is erased. The
moderator's rationale is never returned. The `form_intake_review` reason applies only while
`review` is null.

The staff email intake queue, `GET /api/v1/copyright-email-intakes/review-queue`, uses the same
bounded `after` and `limit` contract with its own cursor scope. It orders unreviewed intakes by
immutable `(received_at, id)`, oldest first, so every email awaiting staff review remains
reachable after the first page. That includes an email whose parse was never recorded: its
`parse_status` is `unparsed`, beside `succeeded` and `failed`, and staff review it from the original
MIME object. A reviewer's decision refreshes the queue from its first page.

Each queue item carries `waiting_reason` and `waiting_since`. An unreviewed intake is
`awaiting_review` and waits since `received_at`. A declined intake whose reply failed or bounced
stays on the queue as `reply_failed` or `reply_bounced`, waiting since that failure, so a sender
who never received the reply is not lost. The queue never lists a declined intake whose reply is
pending or sent.

`POST /api/v1/copyright-email-intakes/:id/reply/replays` retries the failed reply to a declined
intake. It has the case delivery replay's authorization (administrator or moderator) and
suspension rules, takes no body, and returns `200` with `{ replayed: boolean }`. `replayed: true`
means this call reset a `failed` reply to `pending` and queued its email; the stored body and
recipient are unchanged, so the retry sends the exact original text. The reset is one conditional
update, so concurrent calls reset it once and write one `delivery_intent_replayed` audit event
naming the actor. That event has no case: the reply, not a notice, owns it. Every other state,
including a `bounced` reply, a reply that is already `pending` or `sent`, and an unknown intake,
returns `replayed: false` and changes nothing. The `failed` state is the only guard, so it stops a
double click or two reviewers racing, not a second retry: a retried reply that fails again can be
retried again. The route never creates a case or a case queue row.

The staff intake response, `GET /api/v1/copyright-email-intakes/:id`, carries
`copyright_email_intake.ses_verdicts`: `{ spf, dkim, dmarc, spam, virus }`, each `pass`, `fail`,
`gray`, `processing_failed`, or `unknown`. SES reported them in headers it prepended to the message
when it received it, they are fixed when the intake is created, and `unknown` means SES stated
nothing; it never means `pass`. DKIM `pass` means a signature validated, not that the signing domain
aligns with the From address. An SPF, DKIM, or DMARC failure never rejects or changes the status of
an intake. `raw_email.download_url` is `null` when `virus` is `fail`, and
`GET /api/v1/copyright-email-intakes/:id/raw` then answers `409` with the code
`COPYRIGHT_EMAIL_QUARANTINED` before it reads any storage. The other `virus` verdicts keep the
download available, and the staff page warns staff to open the original only in isolation.

`POST /api/v1/copyright-email-intakes/:id/rejections` rejects an email or, with
`response_kind: needs_information`, asks the sender for more information. That kind requires a
`response_message` that is not blank and at most 10,000 characters, which follows the fixed reply
text. It returns `200` with `{ reply_queued: boolean }`, so staff learn whether a reply was queued. With a
succeeded parse the reply goes to the parsed sender. With no parse row or a failed parse there is
no sender, so the optional `reply_email` (a valid address of at most 254 characters, or null)
names the recipient. Without it no reply is queued and `reply_queued` is `false`. On a new
decision, a `reply_email` beside a succeeded parse is a `422`, so a reply never goes to an address
staff did not see next to the parsed sender. A repeated decision is replay-safe: it queues nothing
again and reports whether the original decision queued a reply. A parse recorded after the
decision sends nothing.

`POST /api/v1/copyright-email-intakes/:id/legal-process` closes an initial intake that is legal
process, such as a §512(h) subpoena, with no reply and no email of any kind. The body is
`{ reason: string }`: not blank after trimming, at most 1,000 characters. The reason is encrypted
like the review rationale and is never logged or returned in an error body. It returns `201` with
`{ decision: 'legal_process' }`. It is neither an approval nor a rejection: it opens no case and
creates no assessment, restriction, or claimant-visible event, and the intake leaves the staff email
queue and the review-target count. The same staff roles as approve and reject may call it; others
get `403`. An unknown intake is `404` and an invalid reason `422`. An intake that already has any
decision, including an earlier legal-process one, is `409`, and so is an unresolved or thread-linked
reply. It is not replay-safe on purpose: a repeat reports the conflict so staff do not believe a
second matter was recorded.

The email-intake decision bodies, approvals, rejections, correspondence, and correspondence
rejections, are closed: an unknown key, or a key of the wrong type that no field parser read, is a
`422` before any service call. The field parsers keep their order, so every existing field-named
`422`, the unknown-intake `404`, and every decision outcome is unchanged; see
[request validation](../../reference-copyright-email-intake-request-validation.md).

Staff repeat-infringer actions are separate from that queue payload.
`GET /api/v1/copyright-notices/:id/repeat-infringer-accounts` lists incidents for one case.
Reviewers record incident dispositions and warning or no-action review outcomes. Administrators
record restrict, terminate, and reinstatement. Restrict and terminate suspend the account.
Reinstatement does not unsuspend it.

The disposition, outcome, and reinstatement bodies are closed: an unknown key is a `422` before any
service call, and a missing or invalid `rationale`, `disposition`, or `outcome` keeps its field-named
`422`. The service decides who may record `restrict`, `terminate`, or a reinstatement, so a
moderator who sends a malformed body to an administrator action sees `422` rather than `403`. The
staff review queue keeps the pagination parser's `400` for a malformed cursor or `limit`; see
[request validation](../../reference-copyright-staff-request-validation.md).

The staff submission review bodies, `POST /api/v1/copyright-submissions/:id/appeal-reviews`,
`.../counter-notice-reviews`, and `.../legal-hold-assessments`, are closed: an unknown key is a `422`
before any service call. Every field-named `422`, the unknown-submission `404`, and every appeal,
counter-notice, and legal-hold outcome is unchanged; see
[request validation](../../reference-copyright-submission-review-request-validation.md).

The form-intake review, restriction review, and legal-hold resolution bodies
(`POST /api/v1/copyright-form-intakes/:id/reviews`,
`POST /api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews`, and
`POST /api/v1/copyright-legal-hold-assessments/:id/resolutions`) are closed the same way: an unknown
key is a `422` before any service call, and a JSON `null` restriction review body is a `422` rather
than a `500`. The image-similarity `limit` stays lenient and never answers `422`; see
[request validation](../../reference-copyright-staff-decision-request-validation.md).

Staff issue a one-case guest capability with `POST /api/v1/copyright-notices/:id/guest-capabilities`.
The expiry must be no more than 30 days after issue, and the token is returned only in that
response. `GET /api/v1/copyright-notices/:id/guest-capabilities` lists the case's capabilities
newest first with issuer, expiry, and revocation state, using the bounded `after` and `limit`
(1–100; default 25) contract with a case-scoped cursor; it never returns a token. Staff revoke one
with `POST .../guest-capabilities/:capabilityId/revocation` and request more information with
`POST .../guest-capabilities/:capabilityId/information-requests`. That request records the
correspondence and, in the same transaction, one email delivery to the claimant email retained from
the case's receipt (guest or signed-in); it returns 422 when the case has none. Issuing a capability
emails nothing. A guest files
with `POST /api/v1/copyright-notices/:id/guest-filings` and the `Copyright-Guest-Capability`
header. A capability files at most one court or CCB hold (409 on a repeat), and a received
withdrawal revokes every live capability on the case.

The guest capability and guest filing bodies are closed: an unknown key, or a `cf_turnstile_response`
that is not a string, is a `422` before any service call. The `Copyright-Guest-Capability` header is
checked by the route and never passed to the schema validator, so it cannot appear in a diagnostic.
Existing field-named `422` and the capability `403` are unchanged; see
[request validation](../../reference-copyright-guest-request-validation.md).

The EU, UK, and jurisdiction policy routes validate their path and JSON body against closed
generated schemas: an unknown body key answers 422 before anything is written, and the
field-named 422 messages for missing or mistyped fields are unchanged. `cf_turnstile_response` is
an optional string on the notice and redress bodies; an explicit `null` or non-string value now
answers 422 instead of being ignored when CAPTCHA verification does not read it (an attested
caller or an always-approve configuration). Authentication, staff role, and the kill switch
answer before the schema. The service still decides ownership, jurisdiction availability, and
existence, so a malformed body answers 422 before those 403, 404, and 409 outcomes. See
[Copyright EU, UK, and territorial request validation](../../reference-copyright-territorial-request-validation.md).

Administrators may use `POST /api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts`
with a required, non-empty `rationale` of at most 10,000 characters. It returns 201 with
`{ copyright_restriction_lift: { id } }`. It refuses an active live responder or an already lifted
restriction with 409 and a non-administrator with 403. The body is closed and contract-validated.
See the [administrator lift policy](../../../moderation/COPYRIGHT-NOTICES.md#administrator-lift-without-a-responding-account).

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
filing and any withdrawal revocations in one transaction. Marking a staydown match reviewed is one
update by primary key.
