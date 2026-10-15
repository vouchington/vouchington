# Elections Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The shared `background` worker runs election vote-stat refresh jobs as the `vote-aggregation` domain.

## Exports

- `voteAggregationHandlers` - the domain's handlers. The election handler checks that the job's
  ordering key is `vote-aggregation:<lane>` for the payload's lane and requires a
  metadata-validated relation table for entity-relation jobs; it never scans tables to resolve an
  omitted target.

## Related

- Queue surface: [../../queues/elections/README.md](../../elections/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
