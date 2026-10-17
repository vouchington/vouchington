# Cursors

[Back to PostgreSQL Data Store](README.md#contents)

[bounded-cursor-api.mts](../../../backend/data-stores/psql/bounded-cursor-api.mts) wraps `pg-cursor`
for large reads that must not materialize the full result set. Batch size bounds memory; scheduled
callers also provide a DynamicConfig `maxRows` budget so one run reads a bounded number of rows.

A cap needs a resume strategy. Mutation-backed selectors can query pending state again. Enqueue-only
selectors keep a fixed sweep cutoff and a stable keyset position in queue continuations, so they
never restart at the same prefix on every run. A lost continuation is recovered by the next
scheduled sweep, and reconciliation checkpoints advance only when the whole fixed window drains.

## Retained queue sweeps

Periodic roots enqueue one deduplicated live job per logical sweep scope; the worker saves fixed
bounds before selecting work and the exact cursor after each successful enqueue, so repeated
scheduler roots cannot multiply unfinished sweep chains. Independent scopes must not share a
retained ordering slot, because a delayed job keeps that slot in GlideMQ. Manual events with
distinct fixed windows keep their own scope so coalescing a scheduled sweep cannot discard newer
event fanout.
