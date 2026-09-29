# Article Sync Worker

Source entrypoint: [backend/workers/article-sync/README.md](../../../../../../backend/workers/article-sync/README.md)

Worker package for processing article sync jobs from S3 markdown files.

## Exports

- `articleSyncWorker` - worker instance for the `article-sync` queue (concurrency 1).

## Related

- Queue surface: [../../queues/article-sync/README.md](../../article-sync/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
