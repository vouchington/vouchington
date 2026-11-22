# Event Ingress Routing

How an inbound AWS-native notification (SNS/EventBridge/S3) or third-party webhook reaches the
backend. Generic rules (routing table, self-contained auth, provisional enqueue, no hairpin, SQS
before Lambda, push-first, decision checklist): load the `service-boundaries` skill, "Inbound
events". This doc records what Vouchington chose. Before adding a Lambda in an ingress path,
coordinate the change in the private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository and follow its
OpenTofu instructions.

## Routing

| Source                                    | Path                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SES inbound mail (S3 bucket notification) | SQS, consumed by `backend/workers/ses-inbound-sqs` (`vouchington-infra/opentofu/ses-inbound.tf`)                         |
| Stripe                                    | EventBridge partner event source to SQS (`vouchington-infra/opentofu/stripe-eventbridge.tf`); no public webhook endpoint |
| ActivityPub inbox                         | Public endpoint behind Cloudflare, self-contained checks, then enqueue                                                   |
| Google Play RTDN                          | Public endpoint behind Cloudflare, self-contained Pub/Sub OIDC check, then enqueue                                       |

No source currently needs the enqueue-only Lambda fallback. SQS consumption is a dedicated
consumer lifecycle in `worker-runtime`, parallel to GlideMQ. We accept that second lifecycle to
avoid the public-API hairpin.

A partner event source (Stripe) is not an exception: once a human runs the one-time
`stripe v2 core event_destinations create` and the partner event bus accepts the pending source,
AWS guarantees only Stripe can put events on that bus. Any future exception to the routing rule
must state in its route's `README.md` which axis it sits on and why the standard cells don't fit.

## Why the network boundary matters here

`web`/`api` run on IPv6-only subnets with no IPv4 egress (see
`reference-networking-status-summary.md`). A self-contained check can run on the request path in
the API; a check needing a network round-trip moves to the worker fleet, which has public egress.

## Reference implementation

[`backend/api/activitypub/inbox.mts`](../../../backend/api/activitypub/inbox.mts) is the worked
example for an external sender whose trust decision would need a network round-trip (fetching the
remote actor's public key). On the worker-enabled path:

- `verifyDigest` and the instance-allowlist check (`isFediverseInstanceApprovedByHostname`) are
  self-contained.
- `getRemoteActorByKeyId` reads an already-cached signer. A fresh row runs `verifySignature` and
  rejects invalid signatures before `accept()`.
- Unknown or stale `keyId`s enqueue the signed request envelope and return `202`; the fetch
  (`getOrFetchRemoteActorByKeyId`) and received-time verification run in the worker.
- After the bounded body is validated, atomic inbound capacity reservation protects shared queue
  storage before enqueue. Saturation returns a retryable response without accepting. Each job
  retains its reservation through retries and sender delays and releases it at its terminal
  outcome.

Google Play RTDN uses `/api/v1/memberships/google-play/notifications`: the API verifies Pub/Sub
OIDC against a Valkey snapshot of Google signing keys, stores encrypted evidence, and enqueues a
worker job. Only the worker refreshes those keys or calls Play. A missing or stale snapshot
returns a retryable response without accepting the notification.

Cron reconcilers such as `poll_dispatcher`
(`backend/queues/bedrock-embeddings-batch/enqueues/schedules.mts`) are safety nets that a push
path converges on.

## See also

- [API Egress Proxy](api-egress-proxy.md) — explicit synchronous provider transport for IPv4-only
  endpoints reached from the API tier.
- [Bedrock Embeddings](bedrock-embeddings.md) — the batch pipeline `poll_dispatcher` reconciles
  for.
- [`lambdas/AGENTS.md`](../../../lambdas/AGENTS.md),
  [`backend/api/AGENTS.md`](../../../backend/api/AGENTS.md) — workspace rules linking here.
