# Web Risk service

Checks public HTTP(S) URLs against Google Web Risk only after local hostname and blacklist policy checks pass.

The integration is disabled by default through the `web-risk-config.enabled` dynamic flag, editable
through `/admin/dynamic-config`. Positive Google verdicts block the registrable domain through the
hostname-blocking service without penalizing creators. Clean verdicts are cached per exact URL,
provider rate-limit responses create a cooldown, and local caps keep API usage bounded.
