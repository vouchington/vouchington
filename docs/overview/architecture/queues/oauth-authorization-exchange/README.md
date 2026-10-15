# OAuth Authorization Exchange Queue

Source entrypoint: [backend/queues/oauth-authorization-exchange/README.md](../../../../../backend/queues/oauth-authorization-exchange/README.md)

Exchanges server-held Facebook, X, GitHub, and LinkedIn authorization codes after the public callback has
persisted them in PostgreSQL. Initial payloads contain the durable authorization UUID. Before provider execution, the worker
adds the fenced claim UUID as `exchangeClaimId` through the public job-data API, then a
secret-free `exchangeProviderRequestArmed` marker immediately before provider admission. Active and
retained retry jobs can therefore carry both UUIDs; no provider code, token, or raw error enters Valkey.

## Jobs

- `exchangeOAuthAuthorization` claims one `oauth_authorizations` row with a fenced claim UUID,
  decrypts the server-held code and PKCE verifier, and atomically persists the provider account plus
  the `completion_ready` transition. The authorization UUID is both the job ID and deduplication ID.
- `dispatchOAuthAuthorizationExchanges` scans up to 500 recoverable `callback_received` rows and
  stale `exchanging` claims, removes matching retained completed jobs, re-enqueues missing jobs,
  and retries matching retained failed jobs. It runs every 60 seconds (the global 1-minute
  scheduling floor; see `scheduled-job-manifest/validation.mts`) and is also available as
  the `oauth-authorization-exchange-dispatch` admin backfill. All dispatcher variants share the
  `dispatcher` ordering key at concurrency one so terminal-state inspection and reactivation cannot
  race another recovery pass. The same constant also backs the dispatcher enqueue's Valkey
  throttle-dedup TTL, so the dedup window widened from 5s to 60s together with the interval. The
  manual and backfill triggers carry only that throttle window and no custom job id: a custom id
  would stay claimed while the finished pass is retained (and GlideMQ rejects the backfill's
  `backfill:` prefix as an id), so every later trigger would fail or silently get `null`.

Individual exchanges retry five times with exponential backoff. A recorded continuation
reconciles only its own claim without repeating provider execution. The dispatcher preserves
exact retained unarmed continuations before stale recovery; unavailable or armed outcomes fail
closed. Provider timeout includes ownership persistence and a fresh claim check before admission.
The canonical precedence and cross-store limits are documented in the
[service continuation contract](../../services/oauth/README.md#queue-owned-exchange-continuation).

The initial enqueue is best-effort after callback persistence, preserving the web cookie/redirect
or native handoff. Safe explicit pre-provider release permits a bounded retry. An interrupted armed
request or missing stale ownership is an accepted unknown-outcome loss: no provider replay is
attempted, and the member starts a fresh authorization. Committed account/client results retain
their normal replay contract; this does not replay a consumed provider code.

## Durable Transitions

| Operation                    | Required state                                                         | Durable write                                                    | Replay result                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Begin                        | enabled provider/mode and valid owner/proof                            | `pending`, HMAC state, encrypted verifier, owner/session, expiry | no provider code exists yet; an abandoned row expires                                                                 |
| Provider denial callback     | `pending`                                                              | `rejected`, bounded error, stable completion handoff             | repeated callback returns the same handoff; no job is enqueued                                                        |
| Provider code callback       | `pending`                                                              | encrypted code, stable completion handoff, `callback_received`   | repeated callback returns the same handoff; initial enqueue failure still returns it                                  |
| Dispatch and worker claim    | `callback_received`, or exact retained unarmed ownership               | terminal queue state reactivated, then `exchanging` plus claim   | missing initial work is re-derived; unknown stale claims are rejected; exact retained unarmed jobs resume disposition |
| Provider-account persistence | current fenced claim                                                   | provider account and `completion_ready` in one transaction       | stale claims fail without advancing; post-commit response loss is replayable                                          |
| Client completion            | `completion_ready` and matching owner/session/cookie or proof          | `completed` with authenticated, MFA, or connected result         | a lost client response replays the durable result until expiry                                                        |
| Bounded provider failure     | fifth failed claim, or X code misses its ten-second queue-start budget | `rejected`, clear code and claim                                 | known unused exhaustion is terminal; indeterminate outcomes use unknown-outcome rejection instead of provider replay  |
| Expiry and retention         | any uncompleted row past ten minutes, or any retained terminal row     | `expired` with secrets cleared, then bounded deletion            | terminal; parent user/provider deletion cascades the ephemeral row                                                    |

## Related

- Worker: [../../workers/oauth-authorization-exchange/README.md](../workers/oauth-authorization-exchange/README.md)
- Replayability matrix: [../../../docs/requirements/platform/JOB-REPLAYABILITY.md](../../../../requirements/platform/JOB-REPLAYABILITY.md)
- Queue inventory: [../README.md](../README.md)
