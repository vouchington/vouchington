---
name: vouchington-valkey
description: Use Valkey from Vouchington backend code - deletes, batching, Lua scripts, pub/sub, and replica routing. Use before adding or changing any Valkey call, wherever the file lives.
---

# Vouchington Valkey

- Prefer `unlink` to `del`. Batch complete key sets with `MGET`, `Batch`, or Lua instead of per-key
  sequential calls. Cursor `SCAN` and bounded deletion loops are exceptions; single commands do not
  use `Batch`.
- Application Lua lives in a standalone `scripts/*.lua` file in the owning package (for example
  `backend/services/jwt-session/scripts/`), never in inline multiline strings. Primitive
  conditional-unlink/idempotency-fencing scripts belong in `valkyries`.
- `preferReplica` routes writes to primary; choose `primary` for strongly consistent reads such as
  auth and rate limits.
- Close `createChannelPubSub()` subscriptions on SSE disconnect. Tests close every subscription
  before optional idle-only domain `close*Subscriber()` teardown; shutdown uses the registered
  terminal owner close. Fire-and-forget publishes and signals attach `.catch(onError)` or a
  justified benign catch.
