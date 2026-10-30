# OAuth Authorization Broker Switches

Switch the shared Facebook, X, GitHub, LinkedIn, and Microsoft authorization broker on or off
independently per provider and client. Web defaults to the provider SDK/popup flow (the Facebook JS
SDK and the popup pages under `web/app/auth/callback/<provider>`) because it is the better web
experience; native apps turn the broker on per provider.

The twelve `<provider>_<web|native>_enabled` fields are an intentional method switch, not a
rollout to clean up. They stay so the web method can be changed per provider if ever needed, so the
pre-launch removal of activation flags does not apply to them.
 The operator needs DynamicConfig access
(key `oauth-authorization-broker`) and API/worker log access. Flow design is in
[login flows](../overview/architecture/reference-auth-overview-login-flows.md) and the
[OAuth exchange queue](../overview/architecture/queues/README.md).

## Prerequisites

- Deploy the API, exchange worker, Cloudflare callback rewrite, and client capability handling before
  enabling any field. Every field defaults to `false`, and clients treat a missing
  `broker_capabilities` as all-disabled.
- Each provider app must register the exact HTTPS broker callback for every deployed origin. For
  Microsoft, keep the SDK/popup callback registered because web uses it.
- Confirm the `oauth-authorization-exchange` background domain is healthy and not paused, and that
  exchange latency stays below the provider abort budget and the stale-claim lease.
- Record baseline success, rejection, and latency for the provider flow being replaced.

## Enable

Enable one field at a time (never several in one change; the DynamicConfig audit log is the rollout
record), starting with one provider's native field (a web field only when deliberately moving web off SDK/popup).

1. Exercise authentication, MFA authentication, connection, disconnection, provider denial, and a
   lost-response retry.
2. Confirm callback jobs carry only `authorizationId`; codes, state, completion tokens, and PKCE
   verifiers stay in PostgreSQL ciphertext columns.
3. Confirm the row reaches `completed`, an expired row is removed by retention, the dispatcher
   recovers a deliberately unqueued callback, and a forced repeated provider failure ends `rejected`
   without clogging recovery scans.
4. For native, repeat from a cold app launch. An intercepted
   custom-scheme completion token must fail without the app-held proof verifier, and failed
   finalization must be retryable or cancellable without restarting the app.
5. Repeat for the next provider.

## Rollback

Set only the affected provider/mode field to `false`. Capability responses are `no-store`, so the
next client fetch returns to the web SDK/popup flow (or, for native, to broker-disabled). In-flight authorizations drain until they expire. A
flow whose one-time provider code was consumed before an indeterminate worker failure may become
`rejected` and must be restarted. Do not roll back the worker or callback rewrite while any broker
field is enabled or any unexpired broker row remains.
