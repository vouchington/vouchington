# Fediverse Staging Interoperability - Runbook

Validate Voucha's public ActivityPub discovery, inbound follow lifecycle, Accept delivery, and
outbound transport against controlled Mastodon, Lemmy, and PeerTube instances on staging only.
Architecture is in [federation architecture](../overview/architecture/fediverse-federation.md) and
[fediverse requirements](../requirements/content/FEDIVERSE.md). Staging keeps
[Basic Auth](cloudflare-worker-staging-auth.md) enabled; only the machine routes under test are exempt.

Needs a staging user, a Voucha admin, deployment and log access, and admin access to each controlled
remote instance. Out of scope: provisioning remote servers, production, Bluesky, and publishing Voucha
posts remotely.

## Before you start

- Confirm the API, IO worker, and Cloudflare Worker all run the revision under test, and the
  `activitypub` domain of the `background` queue is healthy.
- Use a dedicated Voucha user with federation enabled and dedicated accounts on each remote. Keep
  hostnames, versions, actor URIs, and credentials in a private operator worksheet; never commit them.
- Create or resolve each remote hostname through the fediverse instances API and approve it with an
  integration change. Record its prior status: changes are append-only, so cleanup appends another change.
- `dig AAAA` each remote host. The API process is IPv6-only, so with asynchronous inbox delivery
  off an IPv4-only remote cannot complete the inline actor fetch.

## Contract under test

Supported: discovery (NodeInfo, WebFinger, actor), remote Follow of a Voucha `Person`, signed `Accept`,
remote `Undo(Follow)`, and signed delivery to an existing follower's inbox (transport only). Unsupported,
and recorded as `unsupported` rather than a pass or failure: remote likes of Voucha posts (posts are not
dereferenceable AP objects), a Voucha user following a remote actor, and a Voucha user liking a remote
object. Do not synthesize missing product workflows or add WebView fallbacks.

## Execution-path rollout

Reversible staging steps; no production flag changes.

1. With `api-egress-proxy.fediverse_search_enabled` and `activitypub-inbox.async_delivery_enabled` both
   false, record baseline search, instance classification, and signed inbox status behavior.
2. Enable the egress proxy flag. Verify search and NodeInfo classification keep the same response
   shapes, and check proxy latency, timeout, and provider-error telemetry.
3. Enable async delivery. Send one controlled signed activity and correlate the `202` with its
   delivery work item and `activitypub` job through to deletion of the pending raw envelope.
4. Confirm the five-minute dispatcher rediscovers eligible durable work; the manual failed-delivery
   backfill only re-arms exhausted operational failures.
5. Continue only after each path is independently healthy.

## Execute

1. Record the deployed SHA, UTC start time, and each pre-test integration status.
2. Without staging Basic credentials, fetch `/.well-known/nodeinfo`, `/nodeinfo/2.0`, WebFinger for the
   Voucha username, the actor document, and `/client-metadata.json`. Each must reach the application.
3. Send an unsigned `POST /ap/inbox` (also with an unknown-bot user agent). Expect the ActivityPub
   signature error and no `WWW-Authenticate` header: the route bypasses Basic Auth and the shared-IP
   edge buckets but not the origin's hostname, signature, or per-hostname controls. Wrong-method and
   neighboring `/ap/inbox/` paths must stay protected by their edge limiter.
4. From each remote, discover the Voucha actor and Follow it. Confirm one active follow relation and one
   signed `Accept` whose object is the original Follow.
5. Unfollow from the remote. The signed `Undo(Follow)` must deactivate the relation without a mirrored
   outbound Follow.
6. Re-follow, perform one supported local action that delivers to followers, and confirm the remote inbox
   accepts the signed POST. This is transport evidence only, not proof the remote UI renders it.
7. After each implementation, check the queue and Sentry for delivery failures. Investigate any new
   terminal failure before calling the row a pass.

## Evidence

Per executed cell, keep redacted evidence only: deployed SHA and UTC time; remote software, exact
version, and a stable redacted hostname alias; activity and request IDs (no signed headers or tokens); local and remote
observations; and `pass`, `fail`, or `unsupported` with a short reason. A run passes when every
applicable cell has evidence, no credentials leaked, test state is cleaned up, and Sentry shows no
unexplained delivery failures. Attach the matrix to the PR Shepherd Journal and the tracking issue.

## Rollback and cleanup

1. Disable async delivery, then the egress proxy flag, independently; verify the pre-rollout statuses
   and direct paths return.
2. Send `Undo(Follow)` from every remote still following, then disable federation for the Voucha user.
3. Restore each prior integration status by appending a change; never edit the projection column.
4. Revoke temporary remote sessions and delete worksheets. Confirm no follow remains active, no
   ActivityPub job is waiting, active, or failed, and no new Sentry delivery failure appeared.
