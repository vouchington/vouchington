# Elections Worker

Worker package for election vote-stat refresh jobs.

## Exports

- `elections` - worker instance for the `elections` queue. It validates the payload ordering key
  against queue ordering and requires a metadata-validated relation table for entity-relation jobs;
  it never scans tables to resolve an omitted target.

## Related

- Queue surface: [../../queues/elections/README.md](../../queues/elections/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
