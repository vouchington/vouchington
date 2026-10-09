# Web Risk service

Source entrypoint: [backend/services/web-risk/README.md](../../../../../backend/services/web-risk/README.md)

Checks public HTTP(S) URLs against Google Web Risk only after local hostname and blacklist policy checks pass.

The integration is disabled by default through the `web-risk-config.enabled` dynamic flag, editable
through `/admin/dynamic-config`. Positive Google verdicts block the registrable domain through the
hostname-blocking service without penalizing creators. Clean verdicts are cached per exact URL,
provider rate-limit responses create a cooldown, and local caps keep API usage bounded.

The default checker binds one state owner for persisted clean verdicts, cooldowns and local request
budgets. Owned checker instances can use an independent namespace and clock while exercising the same
provider and hostname-blocking pipeline. Application clocks choose the UTC month and interpret dated
Retry-After headers; rate-window timestamps and key expiry use the Valkey server clock. Production
budgets persist independently of process teardown.

## Per-URL depth

`assertUrlAllowedByWebRisk(url, { policies? })` reads one hostname policy (blocking and
`should_skip_web_risk`, from the shared `@services/urls-domains-blacklist` helper) concurrently with
one pipelined Valkey `Batch` holding the exact-URL clean-verdict `GET` and the provider-cooldown
`PTTL`. That is one concurrent step instead of the former six serial calls. A blocked hostname is
reported even if the gate read fails, and a skipped hostname never surfaces a gate failure. The
local rate-limit charge stays last and runs only when the URL is not skipped, not clean-cached and
not cooling down. `assertUrlsAllowedByWebRisk(urls)` reads one batched policy for all hostnames and
passes each result into the per-URL check; callers that already hold policies pass them in.
When Web Risk is disabled, only the policy read runs.
