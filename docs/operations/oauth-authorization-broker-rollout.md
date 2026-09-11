# OAuth Authorization Broker Rollout

Enable or roll back the shared Facebook, X, and GitHub authorization broker independently for web
and native clients.

## Scope

- DynamicConfig key: `oauth-authorization-broker`
- Providers: Facebook, X, GitHub
- Modes: `web`, `native`
- Purposes: authentication and account connection
- Operator: developer with DynamicConfig access and API/worker log access

## Prerequisites

- Deploy the API, exchange worker, Cloudflare callback rewrite, and client capability handling
  before enabling any field. All six fields default to `false`. Clients must also treat a missing
  `broker_capabilities` field as all-disabled so they remain compatible while the API rolls out.
- Confirm `oauth-authorization-exchange` is healthy and its 60-second dispatcher schedule exists.
- Confirm exchange latency stays below the 30-second provider abort budget and the 60-second stale
  claim lease.
- Confirm each provider accepts the exact public callback
  `/auth/callback/{facebook|x|github}/broker`.
- Record baseline success, rejection, and latency for the existing provider flow.

## Enable

Enable one field at a time in this order:

1. One provider's web field, such as `github_web_enabled`.
2. Exercise authentication, MFA authentication, connection, disconnection, provider denial, and a
   lost-response retry.
3. Confirm callback jobs contain only `authorizationId`. Codes, state, completion tokens, and PKCE
   verifiers must remain in PostgreSQL ciphertext columns.
4. Confirm the row reaches `completed`, an expired row is removed by data retention, and
   `oauth-authorization-exchange-dispatch` can recover a deliberately unqueued callback. Also
   confirm a forced five-attempt provider failure becomes `rejected` and does not remain at the
   front of recovery scans.
5. Enable that provider's native field and repeat with a cold app launch. Confirm an intercepted
   custom-scheme completion token fails without the app-held proof verifier. Confirm the pending
   verifier survives process recreation in platform-secure storage, and that a failed finalization
   can be retried or cancelled without restarting the app. A handled cold-launch callback must
   route authentication failures to Sign In and connection failures to account settings so those
   recovery controls are immediately visible. Confirm superseding a flow at its deadline cannot
   recreate an expired result, and that a connected result remains durable until refreshed native
   Settings identity includes the provider account. Once a native disconnect DELETE commits,
   confirm the client projects it into local identity immediately. A refresh or confirmation
   failure must stay visible, and recovery must retry identity reconciliation without repeating
   DELETE. If secure storage cannot reveal a cold callback's purpose, the app must still open its
   generic OAuth recovery surface with visible error, retry, and cancellation controls. An initial
   secure-state read failure must offer the same retry and resynchronize once secure storage
   recovers. Retained connection results must fence new OAuth starts until Settings confirms the
   account or the user cancels recovery, and dismissing an OAuth MFA sheet must acknowledge its
   retained result.
6. Repeat for the next provider.

Do not enable multiple fields in one change. DynamicConfig's audit log is the rollout record.

## Verify Legacy Traffic Before Cleanup

The existing `/continue` and `/connect` routes remain the rollback path while broker fields roll
out. Use API access logs grouped by these exact route templates and provider:

- `POST /api/v1/auth/oauth/:provider/continue`
- `PUT /api/v1/auth/oauth/:provider/connect`

Do not remove a provider's old client flow, public runtime identifier, callback page, or server
branch until both web and native broker fields have remained enabled and those legacy routes have
recorded zero requests for that provider for seven consecutive days. This is a human-reviewed
cleanup gate, not an automatic deletion.

## Rollback

Set only the affected provider/mode field to `false`. The provider-capabilities response uses
`Cache-Control: no-store`, so the next client capability fetch observes the disabled field and
returns to the existing provider flow. In-flight broker authorizations continue draining until
their ten-minute expiry. A flow whose one-time provider code was consumed before an indeterminate
worker failure may become `rejected` and must be restarted. Do not roll back the worker or callback
rewrite while any broker field is enabled or any unexpired broker row remains.

## Stale-Doc Sync Notes

Update this runbook when the `oauth-authorization-broker` fields, callback paths, authorization
expiry, exchange schedule, completion proof, legacy routes, or data-retention behavior changes.

## See Also

- [Login flows](../overview/architecture/reference-auth-overview-login-flows.md)
- [OAuth exchange queue](../../backend/queues/oauth-authorization-exchange/README.md)
- [User settings](../requirements/users/USER_SETTINGS.md)
