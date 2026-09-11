# Admin Imports Worker

Worker package for processing rows from admin import batches.

Worker processors dispatch to the service layer; audit row semantics in [Admin Imports Service](../../services/admin-imports/reference-upsert-semantics.md#crm-contacts) before changing dispatcher behavior.
GlideMQ dead-letter queue support was removed; terminal row failures are database-guarded on
`admin_import_rows` instead — see [queue README](../../queues/admin-imports/README.md).

## Exports

- `adminImports` - worker instance for the `admin-imports` queue.

## Related

- Queue surface: [../../queues/admin-imports/README.md](../../queues/admin-imports/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
