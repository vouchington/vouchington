# OAuth Authorization Broker Rollout

Enable or roll back the shared Facebook, X, GitHub, LinkedIn, and Microsoft authorization broker
independently per provider for web and native clients. The operator needs DynamicConfig access
(key `oauth-authorization-broker`) and API/worker log access. Flow design is in
[login flows](../overview/architecture/reference-auth-overview-login-flows.md) and the
[OAuth exchange queue](../overview/architecture/queues/oauth-authorization-exchange/README.md).

## Prerequisites

- Deploy the API, exchange worker, Cloudflare callback rewrite, and client capability handling before
  enabling any field. Every field defaults to `false`, and clients treat a missing
  `broker_capabilities` as all-disabled.
- Each provider app must register the exact HTTPS broker callback for every deployed origin. For
  Microsoft, keep the legacy callback registered while legacy traffic remains.
- Confirm the `oauth-authorization-exchange` background domain is healthy and not paused, and that
  exchange latency stays below the provider abort budget and the stale-claim lease.
- Record baseline success, rejection, and latency for the existing provider flow.

## Enable

Enable one field at a time (never several in one change; the DynamicConfig audit log is the rollout
record), starting with one provider's web field.

1. Exercise authentication, MFA authentication, connection, disconnection, provider denial, and a
   lost-response retry.
2. Confirm callback jobs carry only `authorizationId`; codes, state, completion tokens, and PKCE
   verifiers stay in PostgreSQL ciphertext columns.
3. Confirm the row reaches `completed`, an expired row is removed by retention, the dispatcher
   recovers a deliberately unqueued callback, and a forced repeated provider failure ends `rejected`
   without clogging recovery scans.
4. Enable that provider's native field and repeat from a cold app launch. An intercepted
   custom-scheme completion token must fail without the app-held proof verifier, and failed
   finalization must be retryable or cancellable without restarting the app.
5. Repeat for the next provider.

## Verify legacy traffic before cleanup

The old `/continue` and `/connect` routes remain the rollback path. Group API access logs by those
route templates and provider. Do not remove a provider's old client flow, runtime identifier,
callback page, or server branch until web and native broker fields have stayed enabled and the
legacy routes have recorded zero requests for that provider for seven consecutive days. This is a
human-reviewed gate, not automatic deletion.

## Rollback

Set only the affected provider/mode field to `false`. Capability responses are `no-store`, so the
next client fetch returns to the existing flow. In-flight authorizations drain until they expire. A
flow whose one-time provider code was consumed before an indeterminate worker failure may become
`rejected` and must be restarted. Do not roll back the worker or callback rewrite while any broker
field is enabled or any unexpired broker row remains.
