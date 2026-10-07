# Article Sync Worker

Source entrypoint: [backend/workers/article-sync/README.md](../../../../../../backend/workers/article-sync/README.md)

Worker package for processing article sync jobs from S3 markdown files.

## Exports

- `articleSyncWorker` - worker instance for the `article-sync` queue (concurrency 1).

## Related

- Queue surface: [../../queues/article-sync/README.md](../../article-sync/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

The exported name is retained only as an external surface: its same-file production implementation and
current default callers remain required.

- `publishTerminalStatus`
