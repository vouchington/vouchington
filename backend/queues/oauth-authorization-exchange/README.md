# OAuth Authorization Exchange Queue

Exchanges server-held Facebook, X, and GitHub authorization codes after the public callback has
persisted them in PostgreSQL. Queue payloads contain only the durable authorization UUID.

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
  throttle-dedup TTL, so the dedup window widened from 5s to 60s together with the interval.

Individual exchanges retry five times with exponential backoff. A failed attempt releases its
durable claim before throwing. Provider work uses a 30-second end-to-end abort signal, below the
60-second stale-claim lease, so the dispatcher cannot reclaim a normally running exchange. Rows
that exhaust five durable claims become `rejected` and their provider code is cleared, preventing a
permanent provider failure from monopolizing the oldest recovery page.

The callback's initial enqueue is best-effort after PostgreSQL commits, so queue failure never
withholds the web cookie/redirect or native deep-link handoff. The dispatcher is the non-DLQ
recovery path for work that has not crossed the upstream provider's one-time-code boundary,
including stable IDs occupied by retained completed or failed jobs. Facebook, X, and GitHub do not
provide an idempotency key for authorization code exchange. A process failure after the provider
consumes the code but before the account transaction commits therefore remains an explicit
accepted-loss case: replay is attempted, then the bounded-attempt rule rejects the authorization
and the member starts a fresh flow. Callback persistence, Valkey loss, pre-exchange worker failure,
database failure before commit, and response loss after commit remain replayable from PostgreSQL.

## Durable Transitions

| Operation                    | Required state                                                         | Durable write                                                    | Replay result                                                                         |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Begin                        | enabled provider/mode and valid owner/proof                            | `pending`, HMAC state, encrypted verifier, owner/session, expiry | no provider code exists yet; an abandoned row expires                                 |
| Provider denial callback     | `pending`                                                              | `rejected`, bounded error, stable completion handoff             | repeated callback returns the same handoff; no job is enqueued                        |
| Provider code callback       | `pending`                                                              | encrypted code, stable completion handoff, `callback_received`   | repeated callback returns the same handoff; initial enqueue failure still returns it  |
| Dispatch and worker claim    | `callback_received`, or a stale non-X `exchanging` claim               | terminal queue state reactivated, then `exchanging` plus claim   | missing/terminal Valkey work is re-derived; only the current claim may commit         |
| Provider-account persistence | current fenced claim                                                   | provider account and `completion_ready` in one transaction       | stale claims fail without advancing; post-commit response loss is replayable          |
| Client completion            | `completion_ready` and matching owner/session/cookie or proof          | `completed` with authenticated, MFA, or connected result         | a lost client response replays the durable result until expiry                        |
| Bounded provider failure     | fifth failed claim, or X code misses its ten-second queue-start budget | `rejected`, clear code and claim                                 | terminal; this includes the accepted-loss replay after indeterminate code consumption |
| Expiry and retention         | any uncompleted row past ten minutes, or any retained terminal row     | `expired` with secrets cleared, then bounded deletion            | terminal; parent user/provider deletion cascades the ephemeral row                    |

## Related

- Worker: [../../workers/oauth-authorization-exchange/README.md](../../workers/oauth-authorization-exchange/README.md)
- Replayability matrix: [../../../docs/requirements/platform/JOB-REPLAYABILITY.md](../../../docs/requirements/platform/JOB-REPLAYABILITY.md)
- Queue inventory: [../README.md](../README.md)
