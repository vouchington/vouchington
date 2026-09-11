# Rate Limiter Checklist

[Back to Valkey Data Store](README.md#rate-limiter-checklist)

Treat limiter round-trip reductions as distributed-systems changes, not just script consolidation.
Before changing limiter keys, charging order, or request counts, verify:

- Existing production key formats and state remain readable, especially long-window quota keys.
- Multi-key Lua scripts use one Redis Cluster hash tag for every key in the invocation.
- Short-circuit behavior preserves provider quota semantics; later windows must not be charged when an earlier window blocks.
- Capped long-window limits do not keep appending members after the cap is already reached.
- TTL and sliding-window behavior use Valkey server time rather than local process time.
- DB/Valkey-backed tests use unique keys or serialized execution when shared keys are unavoidable.
- Affected worker `VALKEY_REQUESTS.md` files still document the correct call count and script behavior.
