# Valkey

- Import/declare [per-concern packages](../../../docs/development/valkey/README.md); pub/sub, rate limiting, and GlideMQ never use the general `@data-stores/valkey` barrel.
- Generic cache, Bloom, conditional operations, dynamic config, idempotency, rate limiting, events, scripts, and clients belong in `valkyries`; local packages remain Voucha facades/application glue.
- Prefer `unlink` to `del`. Batch complete key sets with `MGET`, `Batch`, or Lua instead of per-key sequential calls. Cursor `SCAN` and bounded deletion loops are exceptions; single commands do not use `Batch`.
- Application Lua lives in standalone `scripts/*.lua` beside its owner, never inline multiline strings. Primitive conditional-unlink/idempotency-fencing scripts belong in `valkyries`.
- `preferReplica` routes writes to primary; choose `primary` for strongly consistent reads such as auth/rate limits.
- Close `createChannelPubSub()` subscriptions on SSE disconnect. Tests close every subscription before optional idle-only domain `close*Subscriber()` teardown; shutdown uses the registered terminal owner close. Fire-and-forget publish/signals attach `.catch(onError)` or a justified benign catch.
- Keep `sessionValkeyClient`, GlideMQ wiring, analytics forwarding, and `onError` glue local unless `valkyries` explicitly adopts them.
- Preserve isolated `bloomValkeyClient` so rebuilds cannot exhaust cache capacity; [Bloom ownership/config](../../../docs/development/valkey/README.md#bloom-client) remains canonical.
