# Elections Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

Shared `vote-aggregation` worker handles election vote-stat refresh jobs.

## Exports

- `voteAggregation` - shared worker instance for the `vote-aggregation` queue. It validates the payload ordering key
  against queue ordering and requires a metadata-validated relation table for entity-relation jobs;
  it never scans tables to resolve an omitted target.

## Related

- Queue surface: [../../queues/elections/README.md](../../elections/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
