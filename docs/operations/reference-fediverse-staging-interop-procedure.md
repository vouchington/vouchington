# Procedure

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#procedure)

Before executing this leaf from a fresh shell, complete the
[prerequisites](reference-fediverse-staging-interop-prerequisites.md) and record the
[configurable inputs](reference-fediverse-staging-interop-configurable-inputs.md) in a private
operator worksheet. Export the required probe values from that worksheet; the example probe block
fails fast if any is absent:

```bash
: "${STAGING_BASE_URL:?Set STAGING_BASE_URL from the operator worksheet.}"
: "${VOUCHA_USERNAME:?Set VOUCHA_USERNAME from the operator worksheet.}"
: "${VOUCHA_USER_ID:?Set VOUCHA_USER_ID from the operator worksheet.}"
```

### Execution-path rollout

These are reversible staging validation steps, not a record that any production flag was changed.

1. With both flags false, record baseline search, instance-classification, and signed inbox status
   behavior.
2. Set `api-egress-proxy.fediverse_search_enabled: true`. Verify live search and instance creation's
   NodeInfo classification complete through the HTTP CONNECT proxy with the same public response
   shapes. Check proxy latency, timeout, and provider-error telemetry before continuing.
3. Set `activitypub-inbox.async_delivery_enabled: true`. Send one controlled signed activity and correlate
   the `202` with its `ap_inbox_deliveries` row and `activitypub-inbox` job. Verify the I/O worker
   fetches the actor, verifies against `received_at`, applies actor-match and sender limits, then
   deduplicates/dispatches and deletes the final pending raw envelope.
4. Exercise recovery by confirming the five-minute dispatcher can rediscover eligible durable work;
   verify the manual failed-delivery backfill only re-arms exhausted operational failures.
5. Continue with interoperability only after each execution path is independently healthy.

### Execute

1. Record the configured inputs, deployed SHA, UTC start time, and each pre-test integration status.
2. Without staging Basic credentials, fetch NodeInfo discovery, NodeInfo 2.0, WebFinger for
   `VOUCHA_USERNAME`, the returned actor document, and `/client-metadata.json`. Confirm every
   response reaches the application and the actor URI contains `VOUCHA_USER_ID`.
3. Send an unsigned `POST /ap/inbox`. Confirm the response has the ActivityPub signature error and
   no `WWW-Authenticate` header, even when the staging generic and unknown-bot mutating edge
   bindings reject their buckets. Repeat with an unknown-bot user agent. This proves the exact
   delivery route bypassed staging Basic Auth and both shared-IP edge buckets but did not bypass
   the origin's approved-hostname, signature, or DynamicConfig per-hostname controls. Confirm a
   wrong-method `/ap/inbox`, `/ap/inbox/`, and neighboring `/ap/inbox/test` probe remains protected
   by its applicable edge limiter.
4. For each remote implementation, use its controlled account to discover the Voucha actor and
   initiate a Follow when that software supports following a `Person` actor. Capture the remote
   activity ID and Voucha request ID.
5. Confirm Voucha stores one active `remote_actor -> user` follow relation and enqueues one signed
   `Accept`. Confirm the remote instance receives an `Accept` whose object is the original Follow.
6. Initiate unfollow on the remote instance. Confirm its signed `Undo(Follow)` makes the relation
   inactive without causing a mirrored outbound Follow.
7. With the remote actor following again, perform one supported local social action that exercises
   follower delivery. Confirm the remote inbox accepts the signed POST. Record this as transport
   evidence only; do not claim the remote UI rendered or understood a Voucha object.
8. Record every unsupported matrix cell explicitly. Do not synthesize missing product workflows or
   add WebView/open-web fallbacks.
9. Check the ActivityPub delivery queue and Sentry for delivery failures after each implementation.
   Investigate any new terminal delivery failure before calling that row a pass.

Example public-route probes:

```bash
curl -fsS "${STAGING_BASE_URL}/.well-known/nodeinfo"
curl -fsS "${STAGING_BASE_URL}/nodeinfo/2.0"
curl -fsS --get --data-urlencode \
  "resource=acct:${VOUCHA_USERNAME}@${STAGING_BASE_URL#https://}" \
  "${STAGING_BASE_URL}/.well-known/webfinger"
curl -fsS "${STAGING_BASE_URL}/ap/users/${VOUCHA_USER_ID}"
curl -fsS "${STAGING_BASE_URL}/client-metadata.json"
curl -sS -D - -o /dev/null -X POST "${STAGING_BASE_URL}/ap/inbox"
```

### Rollback And Cleanup

1. Set `activitypub-inbox.async_delivery_enabled: false` independently. Verify signed deliveries again use
   inline actor fetch/signature verification and retain the exact pre-rollout success, duplicate,
   authentication, and rate-limit statuses.
2. Set `api-egress-proxy.fediverse_search_enabled: false` independently. Verify search and NodeInfo
   classification use the direct API path with unchanged response shapes.
3. Send `Undo(Follow)` from every remote account that still follows the Voucha actor.
4. Set `fediverse_federation_enabled: false` for the dedicated Voucha user.
5. Restore each prior instance integration status by appending an integration change. Never update
   the projection column directly.
6. Revoke temporary remote sessions or tokens and remove private worksheets or credential files.
7. Confirm no test follow remains active, no new ActivityPub inbox or delivery job remains waiting,
   active, or failed, and no new Sentry delivery-failure event was recorded.
