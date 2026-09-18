# Prerequisites

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#prerequisites)

- Confirm the API, IO worker, and Cloudflare Worker all run `DEPLOYED_SHA`.
- Confirm the `activitypub-inbox` queue/worker is registered and healthy.
- Confirm API egress proxy routing is disabled for the direct baseline.
- Use dedicated test accounts. Confirm access to remote request logs or database state for each
  instance, plus Voucha request logs and the queue-monitoring API.
- Set `fediverse_federation_enabled: true` for `VOUCHA_USER_ID` through
  `PATCH /api/v1/users/{id-or-slug}` using an approved authenticated API client.
- Create or resolve each remote hostname with `POST /api/v1/fediverse/instances`. Record the topic
  ID, then use `POST /api/v1/fediverse/instances/{id}/integration-changes` with
  `{ "integration_status": "approved", "reason": "controlled staging interop" }`.
- `dig AAAA` each `*_HOST` before approving it. With asynchronous inbox delivery disabled, the
  inbox's actor fetch runs in the `api` process, which is IPv6-only in this environment — an
  IPv4-only remote host cannot complete step 1 of the execution-path rollout below. See the
  "Ordering gate — ActivityPub inbox IPv4-only actor reachability" section of the phase-4 SSM
  parameter store checklist in the private `vouchington-infra` repository.
- Record each instance's prior integration status. Status changes are append-only and must be
  restored by appending another change during cleanup.
- Keep staging Basic Auth enabled. The machine routes under test are narrowly exempt; authenticated
  administrative API calls still require the normal staging and application credentials.
