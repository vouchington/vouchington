# Admin Imports Worker

Source entrypoint: [backend/workers/admin-imports/README.md](../../../../../../backend/workers/admin-imports/README.md)

Worker package for processing rows from admin import batches.

Worker processors dispatch to the service layer; audit row semantics in [Admin Imports Service](../../../services/admin-imports/reference-upsert-semantics.md) before changing dispatcher behavior.
GlideMQ dead-letter queue support was removed; terminal row failures are database-guarded on
`admin_import_rows` instead — see [queue README](../../admin-imports/README.md).

## Exports

- `adminImports` - worker instance for the `admin-imports` queue.

## Related

- Queue surface: [../../queues/admin-imports/README.md](../../admin-imports/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
