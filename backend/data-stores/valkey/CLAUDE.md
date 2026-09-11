# Valkey

See the [Valkey data-store reference](README.md) for package architecture and operation guidance.

- Import and declare the per-concern package documented in [README.md](README.md); do not route
  pub/sub, rate limiting, or GlideMQ through the general `@data-stores/valkey` barrel.
- Reusable cache, Bloom filter, conditional operation, dynamic config, idempotency-key, rate limiter, event, script, and generic client behavior is provided by `valkyries`. Keep these packages as Voucha facades plus application-specific glue.
- Prefer `unlink` over `del`.
- Minimize in-flight round-trips: prefer a single `Batch` or Lua call over N sequential awaited calls. Avoid per-item/key-by-key Valkey calls inside loops — collect the full key set first and use `MGET` or `Batch`. Cursor-based `SCAN` workflows (advancing the cursor page-by-page) and bounded deletion loops are exceptions.
- Use [Batch](https://valkey.io/valkey-glide/node/Batch/classes/Batch/) or Lua scripts for batching multiple commands. Do not use `Batch` for single commands.
- Store application-owned Lua scripts in standalone `.lua` files under `scripts/` relative to where they are used — never inline multiline strings. Primitive scripts, including conditional unlink and idempotency-key fencing, live in `valkyries`.
- `preferReplica` clients route write commands to primary automatically. Use `primary` only when reads must be strongly consistent (auth, rate limits).
- Pub/sub subscribers created via `createChannelPubSub()` need explicit `subscription.close()` on SSE disconnect. Tests must close every subscription before optionally calling the idle-only domain `close*Subscriber()` teardown; process shutdown uses the terminal owner close registered by the data store. Intentional fire-and-forget publish or signal calls must attach `.catch(onError)` or a justified benign catch.
- Keep `sessionValkeyClient`, GlideMQ wiring, analytics forwarding, and `onError` integration local unless `valkyries` explicitly grows those app responsibilities.

## Bloom Client

Preserve `bloomValkeyClient` as an isolated named client so rebuilds cannot exhaust the cache client.
Its ownership, environment variables, and isolation rationale live in
[README.md § Bloom Client](README.md#bloom-client).

## Related

- Reference documentation: [README.md](README.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
