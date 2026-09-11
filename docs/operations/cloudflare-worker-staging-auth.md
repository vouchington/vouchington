# Staging Basic Auth — Runbook

Runbook for enabling, rotating, and disabling the HTTP basic-auth gate on
`staging.voucha.ai`.

## How it works

The gate runs inside the Cloudflare Worker (`cloudflare-worker/src/basic-auth.mts`),
invoked early in `src/request-handler.mts`; covered requests consume the normal identity
rate limiter before credential validation. When `BASIC_AUTH_CREDENTIALS` is set, every
covered request to `staging.voucha.ai` returns 429 if the limiter rejects first. If the
limiter allows the request but it lacks a valid `Authorization: Basic` header, it receives a
401 with
`WWW-Authenticate: Basic realm="Voucha Staging", charset="UTF-8"`. The
`Authorization: Basic` header is stripped before the request is forwarded to origin
(`src/proxy.mts`) so the staging password never appears in origin logs.

For staging validation that must also send backend Bearer auth, keep the Bearer value in the normal
`Authorization` header and put the staging Basic value in
`X-Voucha-Staging-Authorization`. The secondary header is accepted only while
`BASIC_AUTH_CREDENTIALS` is configured and only alongside one syntactically valid Bearer header.
It is stripped before every origin and cache RPC. Missing, malformed, duplicate, or ambiguous
primary/secondary combinations fail closed with 401 unless the limiter rejects first; ordinary
Basic behavior is unchanged.

The gate is **OFF** only when `BASIC_AUTH_CREDENTIALS` is unset or empty (production and
local never set it). It is **fail-closed**: if the secret is set and any entry is malformed,
all non-exempt requests receive the 401 challenge unless the limiter rejects first.

### Browser agents and Turnstile

Do not inject `Authorization: Basic` through Chrome DevTools `extraHttpHeaders`. That header is
sent on every request from the page, including `challenges.cloudflare.com`, and Turnstile then
fails with client error `600010`. Prefer origin-scoped HTTP auth (browser prompt, or
`https://user:pass@staging.voucha.ai/…`). If MCP Chrome still cannot complete the widget after
that, use [staging Turnstile always-approve](staging-turnstile-always-approve.md). Do not change
stored Turnstile credentials.

### Exempt paths

Machine callers that authenticate via their own HMAC/Bearer/SNS mechanism cannot supply
HTTP Basic Auth credentials. Public federation discovery documents also must be fetchable before
their remote callers can establish a relationship. A third category is spec-mandated anonymous
browser fetches — the Web App Manifest is fetched with credentials omitted unless the `<link>`
carries `crossorigin="use-credentials"`, so an authenticated browser never offers its cached Basic
Auth credential. These paths bypass the gate only for the listed methods and are listed in
`BASIC_AUTH_EXEMPT_PATHS` / `BASIC_AUTH_EXEMPT_METHODS_BY_PATH` in `src/basic-auth.mts`:

| Path                                                | Methods       | Caller              | Auth mechanism                       |
| --------------------------------------------------- | ------------- | ------------------- | ------------------------------------ |
| `/api/v1/mcp`                                       | `POST`        | MCP clients         | Bearer API key                       |
| `/api/v1/admin/mcp`                                 | `POST`        | MCP clients         | Bearer API key                       |
| `/api/v1/memberships/apple-app-store/notifications` | `POST`        | Apple App Store     | signed payload at backend            |
| `/.well-known/webfinger`                            | `GET`         | Fediverse servers   | none (public discovery)              |
| `/.well-known/nodeinfo`                             | `GET`         | Fediverse servers   | none (public discovery)              |
| `/nodeinfo/2.0`                                     | `GET`         | Fediverse servers   | none (public discovery)              |
| `/ap/users/{id}`                                    | `GET`         | Fediverse servers   | none (public actor document)         |
| `/ap/inbox`                                         | `POST`        | Fediverse servers   | HTTP signature                       |
| `/client-metadata.json`                             | `GET`         | AT Protocol servers | none (public OAuth metadata)         |
| `/auth/callback/facebook/broker`                    | `GET`         | Facebook OAuth      | OAuth state                          |
| `/auth/callback/x/broker`                           | `GET`         | X OAuth             | OAuth state                          |
| `/auth/callback/github/broker`                      | `GET`         | GitHub OAuth        | OAuth state                          |
| `/infra/ping`                                       | `GET`, `HEAD` | Health checks       | none (public)                        |
| `/infra/cache-purge`                                | `POST`        | Backend             | shared key                           |
| `/manifest.webmanifest`                             | `GET`, `HEAD` | Browsers (PWA)      | none (spec-mandated anonymous fetch) |

`/ap/users/{id}` matches exactly one UUID segment, case-insensitively, with an optional trailing
slash. Empty, non-UUID, neighboring, and nested actor paths remain protected. All other rows are
exact normalized path matches. Wrong methods remain protected for every row.

## Enable

Set the encrypted `BASIC_AUTH_CREDENTIALS` binding on the private-infrastructure-managed staging
Worker through the Cloudflare operator interface, then dispatch the source revision through the
normal private receiver. Filaments contains no deployed Worker target or provider identifier.

**Constraints:**

- Usernames and passwords must **not contain a comma** (it is the delimiter).
- Colons _inside_ a password are fine — only the first colon separates username from password.
- The Worker `BASIC_AUTH_CREDENTIALS` binding is **not wired into CI**
  (the infrastructure deployment receiver does not set or replace it), so this is a manual one-time step. It
  survives future automated worker deploys unchanged.
- The infrastructure receiver deliberately has no copy of the Basic Auth value. Authenticated
  post-deploy browser/smoke QA uses an operator-local credential; GitHub Actions does not store a
  duplicate probe secret.
- Treat each pair as an operator credential. The supported manual rollback window is the set of
  Worker version IDs retained as known-good rollback targets. Keep every credential needed by a
  retained version available to operators until that version leaves the rollback set.

## Rotate credentials

Multi-pair support keeps rotation zero-downtime. Add the new pair to the encrypted binding, verify
it with the operator-owned smoke procedure below, retain the old pair through the rollback window,
then update the binding again to remove the old pair.

If the new credential receives 401, inspect the active Worker version and restore the intended
credential/version contract before continuing. Do not delete the old pair or retire a known-good
version until the new pair has passed live verification.

## Disable

Delete the encrypted binding through the Cloudflare operator interface. The resulting Worker
version deactivates the gate as soon as it is live.

## Verify

Load `STAGING_CANARY_SECRET` from the operator-managed current staging `CF_WORKER_SECRET`; do not
copy it into a GitHub secret. The same value authenticates the staging-only fault control and the
cache-purge route.

```bash
(
  set +x
  set -euo pipefail
  : "${STAGING_USER:?Load the operator username without printing it.}"
  : "${STAGING_PASS:?Load the operator password without printing it.}"
  : "${STAGING_CANARY_SECRET:?Load the operator canary secret without printing it.}"

  case "$STAGING_USER$STAGING_PASS$STAGING_CANARY_SECRET" in
    *$'\r'*|*$'\n'*|*'"'*)
      echo 'ERROR: staging smoke credentials contain a curl-config control character.' >&2
      exit 1
      ;;
  esac

  auth_config=$(mktemp)
  canary_config=$(mktemp)
  canary_body=$(mktemp)
  canary_headers=$(mktemp)
  unauthenticated_headers=$(mktemp)
  trap 'rm -f "$auth_config" "$canary_config" "$canary_body" "$canary_headers" "$unauthenticated_headers"' EXIT
  chmod 600 "$auth_config"
  chmod 600 "$canary_config"

  basic_token=$(printf '%s' "$STAGING_USER:$STAGING_PASS" | base64 | tr -d '\n')
  printf 'header = "Authorization: Basic %s"\n' "$basic_token" > "$auth_config"
  {
    printf 'header = "Authorization: Basic %s"\n' "$basic_token"
    printf 'header = "X-Voucha-Staging-Canary-Secret: %s"\n' "$STAGING_CANARY_SECRET"
    printf 'header = "X-Voucha-Cache-Purge-Secret: %s"\n' "$STAGING_CANARY_SECRET"
  } > "$canary_config"
  unset basic_token STAGING_CANARY_SECRET

  expect_canary_failure() {
    expected_status=$1
    fault=$2
    url=$3
    shift 3
    : > "$canary_headers"
    actual_status=$(curl -q --config "$canary_config" --silent --show-error \
      --output "$canary_body" --dump-header "$canary_headers" --write-out '%{http_code}' \
      --header "X-Voucha-Staging-Canary-Fault: ${fault}" "$@" "$url")
    [ "$actual_status" = "$expected_status" ] || {
      echo "ERROR: ${fault} returned ${actual_status}, expected ${expected_status}." >&2
      exit 1
    }
    jq -e '.code | type == "string"' < "$canary_body" >/dev/null || {
      echo "ERROR: ${fault} did not return the secured JSON error envelope." >&2
      exit 1
    }
    if tr -d '\r' < "$canary_headers" | grep -iE \
      '^(x-voucha-staging-canary-(secret|fault)|x-voucha-internal-canary-fault|x-voucha-cache-purge-secret):' \
      >/dev/null; then
      echo "ERROR: ${fault} exposed a staging control header." >&2
      exit 1
    fi
  }

  unauthenticated_status=$(curl -q --silent --show-error --head --output /dev/null \
    --dump-header "$unauthenticated_headers" --write-out '%{http_code}' \
    https://staging.voucha.ai/)
  [ "$unauthenticated_status" = 401 ] || {
    echo "ERROR: unauthenticated staging request returned ${unauthenticated_status}, expected 401." >&2
    exit 1
  }
  tr -d '\r' < "$unauthenticated_headers" | \
    grep -iFx 'www-authenticate: Basic realm="Voucha Staging", charset="UTF-8"' >/dev/null || {
    echo 'ERROR: staging 401 omitted the expected Basic Auth challenge.' >&2
    exit 1
  }

  authenticated_status=$(curl -q --config "$auth_config" --silent --show-error --head \
    --output /dev/null --write-out '%{http_code}' https://staging.voucha.ai/)
  [ "$authenticated_status" = 200 ] || {
    echo "ERROR: authenticated staging request returned ${authenticated_status}, expected 200." >&2
    exit 1
  }

  exempt_status=$(curl -q --silent --show-error --head --output /dev/null \
    --write-out '%{http_code}' https://staging.voucha.ai/infra/ping)
  [ "$exempt_status" = 200 ] || {
    echo "ERROR: exempt staging ping returned ${exempt_status}, expected 200." >&2
    exit 1
  }

  canary_status=$(curl -q --config "$auth_config" --silent --show-error \
    --output "$canary_body" --dump-header "$canary_headers" --write-out '%{http_code}' \
    https://staging.voucha.ai/infra/edge-cache-canary)
  [ "$canary_status" = 200 ] || {
    echo "ERROR: authenticated staging canary returned ${canary_status}, expected 200." >&2
    exit 1
  }
  jq -e \
    '.generation | (type == "string" and length > 0)' < "$canary_body" >/dev/null || {
    echo 'ERROR: staging canary omitted its generation identifier.' >&2
    exit 1
  }
  tr -d '\r' < "$canary_headers" | grep -iFx 'cache-control: no-store, max-age=0, must-revalidate' \
    >/dev/null || {
    echo 'ERROR: staging canary omitted its browser no-store policy.' >&2
    exit 1
  }
  tr -d '\r' < "$canary_headers" | grep -iFx 'cache-tag: edge-cache-canary' >/dev/null || {
    echo 'ERROR: staging canary omitted its dedicated purge tag.' >&2
    exit 1
  }
  tr -d '\r' < "$canary_headers" | grep -iFx 'x-voucha-cache: DISPATCHED' >/dev/null || {
    echo 'ERROR: staging canary did not dispatch through the cache entrypoint.' >&2
    exit 1
  }

  expect_canary_failure 503 sie https://staging.voucha.ai/infra/edge-cache-canary
  expect_canary_failure 500 unexpected-throw https://staging.voucha.ai/infra/edge-cache-canary
  expect_canary_failure 502 purge-reject https://staging.voucha.ai/infra/cache-purge \
    --request POST --header 'content-type: application/json' \
    --data '{"tags":["edge-cache-canary"]}'
)
```

The subshell disables inherited shell tracing before expanding any credential variable. The
credentials are then written only as headers in mode-`600` temporary curl configurations; they
never appear in curl's process arguments. `-q` is deliberately every curl invocation's first
argument so an operator's default curl configuration cannot change failure behavior or enable
verbose or trace output. The procedure fails unless the gate returns the exact `401` challenge and
the authenticated, exempt, and normal canary checks return `200`. It also requires the controlled
SIE, unexpected-throw, and purge-rejection paths to return their exact secured `503`, `500`, and
`502` contracts without exposing a control header.

The private infrastructure deployment receiver validates and deploys immutable artifacts but does
not receive the Basic Auth credential or claim authenticated smoke-test success. Keep operator QA
evidence separate from receiver-run evidence, and do not place credentials in issues, pull requests,
or logs. Operators own live validation of the protected canary and fault controls because the
receiver has neither the Basic Auth credential nor the canary secret.

## See also

- Rule description: [`cloudflare-worker/CLAUDE.md`](../../cloudflare-worker/CLAUDE.md) —
  "Staging basic auth" rule
- Implementation: [`cloudflare-worker/src/basic-auth.mts`](../../cloudflare-worker/src/basic-auth.mts)
- Deployment target and encrypted binding: private `vouchington-infra` Worker topology
- Provisioning checklist: [`vouchington-infra` OpenTofu checklist](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/HUMAN_CHECKLIST.md)
  (Step 9a — CF Worker deploy variables)
- Federation validation: [Fediverse staging interoperability](fediverse-staging-interop.md)
- MCP Turnstile skip: [Staging Turnstile always-approve](staging-turnstile-always-approve.md)
