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
