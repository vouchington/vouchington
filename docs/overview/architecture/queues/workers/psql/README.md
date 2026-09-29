# PostgreSQL Worker

Source entrypoint: [backend/workers/psql/README.md](../../../../../../backend/workers/psql/README.md)

Worker package for PostgreSQL maintenance jobs such as migrations, config-driven operations, views, partitions, and data-retention cleanup.

## Exports

- `psql` - worker instance for the `psql` queue.

## Related

- Queue surface: [../../queues/psql/README.md](../../psql/README.md)
- PostgreSQL data store: [../../data-stores/psql/README.md](../../../../../development/postgresql/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
