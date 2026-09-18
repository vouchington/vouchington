# Event Ingress Routing

How an inbound event — an AWS-native notification (SNS/EventBridge) or a third-party webhook —
should reach the backend. This doc is the canonical answer so it does not get re-derived per
integration; see the [`event-ingress-routing` skill](../../../.agents/skills/event-ingress-routing/SKILL.md)
for the load-before-adding-a-route pointer.

## The rule

|                        | Auth is self-contained (reads only request bytes + local state)                                                                                                                                                                                                               | Auth needs a network round-trip                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Sender inside AWS**  | AWS-native delivery straight to an SQS queue, consumed by a worker — no Lambda in the path — whenever the source supports an SQS target (an EventBridge rule, an SNS subscription). An in-VPC enqueue-only Lambda is the fallback, used only when no such native path exists. | Same, but the network call happens in the worker after dequeue |
| **Sender outside AWS** | Public endpoint behind Cloudflare, self-contained auth, then enqueue                                                                                                                                                                                                          | Not viable on the request path — see below                     |

Three corollaries follow from the table:

- **Never hit the public API endpoint from inside AWS.** An SNS/EventBridge-triggered notification
  that gets forwarded by POSTing to the public backend URL leaves the VPC, crosses Cloudflare, and
  re-enters the same AWS account for no reason — a private, AWS-native path (SQS) is available
  instead, whether or not that path also happens to involve a Lambda.
- **Prefer native SQS delivery over a Lambda hop.** EventBridge and SNS can target an SQS queue
  directly; a worker reads from it via a dedicated SQS consumer lifecycle in `worker-runtime`,
  parallel to GlideMQ, not merged into it. Introducing a Lambda whose only job is "receive this
  notification and forward it" adds a deploy artifact, a cold start, and — historically in this
  repo — the temptation to forward it by POSTing to the public API instead of enqueueing directly.
  If the AWS service can target SQS, there is no reason for a Lambda to sit in between.
- **When a Lambda is unavoidable, it stays enqueue-only.** A source with no native SQS-capable
  delivery (see the checklist below) still needs a Lambda in the VPC, but that Lambda must
  (a) do only a self-contained auth/validation check and (b) enqueue a job or write to the queue it
  fronts. It must not perform other external IO (an outbound HTTP call, a second AWS service call
  beyond the write) — that belongs in a worker, which can retry, backoff, and batch, none of which
  a Lambda invocation should own.

## "Self-contained" — mechanical definition

A check is self-contained iff it reads only the request bytes and local state (a DB or cache
read through the normal data-store clients). Anything that issues an outbound network request —
an HTTP fetch, a lookup against a remote host, a call to an external API — is **not**
self-contained, no matter how it looks at the call site. The two kinds of check are easy to
confuse because they can sit on adjacent lines of the same handler; the network boundary is the
only thing that matters.

This distinction is load-bearing here specifically because `web`/`api` run on IPv6-only subnets
with no IPv4 egress (see
[`reference-networking-status-summary.md`](../infrastructure/reference-networking-status-summary.md)).
A self-contained check can always run directly on the request path, in the API or in an in-VPC
Lambda. A check that needs a network round-trip cannot safely run there — it has to move to the
worker fleet, which does have public egress.

## Reference implementation

[`backend/api/activitypub/inbox.mts`](../../../backend/api/activitypub/inbox.mts) is the worked
example for an external sender whose full trust decision would normally require a network
round-trip (fetching the remote actor's public key). The worker-enabled path never performs that
fetch on the request path:

- `verifyDigest` reads only the request body → self-contained.
- The instance-allowlist check, `isFediverseInstanceApprovedByHostname`, is a DB read →
  self-contained.
- `getRemoteActorByKeyId` is a DB read of an already-cached signer. When that row exists, the
  handler runs `verifySignature` against the cached key and rejects invalid signatures before
  `accept()`. Crypto against local state is still self-contained.
- Unknown `keyId`s skip that local check, persist via
  `activityPubInboxDeliveryTransitions.accept()`, enqueue, and return `202`. The handler never
  calls `getOrFetchRemoteActorByKeyId` on the worker-enabled request path. That outbound fetch
  and received-time verification run inside the worker after dequeue, where public egress is
  available.

Model any new "external sender, auth needs a fetch" route on this file: self-contained checks
gate persistence and enqueue; the network-dependent verification happens after the job leaves the
request path.

Google Play RTDN uses the public Cloudflare ingress at
`/api/v1/memberships/google-play/notifications`: the API verifies Pub/Sub OIDC against a Valkey
snapshot of Google signing keys, stores encrypted evidence, and enqueues a worker job. Only the
worker refreshes those keys or calls Play. A missing or stale signing-key snapshot returns a
retryable response without accepting the notification.

## Real-time is required, not optional

Every ingress path must be push or long-poll — never the sole reliance on interval polling. Cron
reconcilers such as `poll_dispatcher`
(`backend/queues/bedrock-embeddings-batch/enqueues/schedules.mts:17-34`, which runs every minute)
exist as **safety nets that a push path converges on**, not as the primary trigger. If a new event
source has no push mechanism and a cron job is the only way data flows in, that is a signal the
integration is missing an enqueue path — not a reason to shorten the polling interval.

## Decision checklist for a new event source

1. **Is the sender inside AWS** (SNS, EventBridge, an S3 event) **or outside** (a third-party
   webhook)?
2. **Can every check needed before persisting run with only request bytes and local DB/cache
   reads?** If yes for both branches below, land on the enqueue-only path directly. If no, the
   network-dependent part moves into the worker, after enqueue — see the reference
   implementation above.
3. **Inside AWS:** check whether the source can target SQS natively — an EventBridge rule target,
   an SNS subscription, or an S3 bucket notification (`aws_s3_bucket_notification`'s `queue`
   block). If yes, that is the answer: no Lambda in the path, a worker consumes the queue via the
   SQS consumer lifecycle in `worker-runtime` — this is what SES inbound mail receiving does
   (`vouchington-infra/opentofu/ses-inbound.tf`, `backend/workers/ses-inbound-sqs`), after an earlier design wrongly
   assumed S3 could not deliver to SQS directly and routed through a Lambda instead. If no native
   SQS-capable delivery exists at all, fall back to an in-VPC, enqueue-only Lambda: (a) do only a
   self-contained auth/validation check and (b) enqueue a job or write to the queue it fronts,
   nothing else. No source in this repo currently needs that fallback. Either way, never route an
   AWS-internal event out to the public endpoint and back in — that hairpin adds Cloudflare
   latency and a public attack surface for a call that two AWS resources could otherwise make
   directly.
4. **Outside AWS:** a public endpoint behind Cloudflare is unavoidable — external callers have no
   other way in. Self-contained auth on that endpoint is a requirement, not a preference: since
   the handler cannot safely make an outbound call itself (see above), an auth check that
   genuinely needs a network round-trip cannot be resolved at the edge and must be deferred into
   the worker after a provisional enqueue.
5. **A third-party sender using an EventBridge _partner_ event source is not an exception to rule 3.** Stripe (`vouchington-infra/opentofu/stripe-eventbridge.tf`) delivers this way: once a human runs the one-time
   `stripe v2 core event_destinations create` and this repo's partner event bus accepts the pending
   source, AWS itself guarantees that only Stripe can put events onto that bus — the same trust
   boundary as a native EventBridge rule, just provisioned by a third party instead of another AWS
   account. No public endpoint, no HMAC verification, no Lambda; a worker consumes SQS the same as
   any other AWS-native sender. The now-deleted `POST /api/v1/webhooks/stripe` route (#9330) was
   this doc's prior carve-out under rule 4, back when the partner event source did not yet exist.
   Exceptions must be enumerated, not discovered by accident: any future one must state, in its
   route's `README.md`, which axis it sits on and why the standard cells don't fit.

## SQS for AWS-native senders; Lambda only as a fallback

- **SQS is the default AWS-native transport.** When EventBridge or SNS can target a queue
  directly, use it. The alternative — a Lambda that receives the notification and POSTs it to our
  own public API — is the exact hairpin this doc exists to rule out: it leaves the VPC, crosses
  Cloudflare, and re-enters the same AWS account, and it requires a hand-rolled shared secret with
  its own rotation schedule. SQS delivers at-least-once with a queue-native DLQ and redrive
  policy, which a bare SNS→Lambda subscription doesn't give you without building it yourself.
- **The accepted cost is a second consumer lifecycle.** Workers already run GlideMQ; adding an SQS
  consumer lifecycle in `worker-runtime`, parallel to it, means every future reader has to know
  both. That cost is taken deliberately, in exchange for removing the public-API hairpin — it is
  not a free upgrade.
- **Lambda is still the right tool when there is no native SQS-capable delivery** — see the
  decision checklist above. It is never the right tool for anything that needs external IO,
  longer-than-Lambda-timeout processing, or batching; that work stays in workers, which the
  Lambda's job hands off to immediately.

## See also

- [API Egress Proxy](api-egress-proxy.md) — explicit synchronous provider transport for IPv4-only
  endpoints reached from the API tier.
- [Bedrock Embeddings](bedrock-embeddings.md) — the batch pipeline `poll_dispatcher` reconciles
  for.
- [`lambdas/CLAUDE.md`](../../../lambdas/CLAUDE.md), OpenTofu (the private `vouchington-infra` repository),
  [`backend/api/CLAUDE.md`](../../../backend/api/CLAUDE.md) — workspace rules linking here.
