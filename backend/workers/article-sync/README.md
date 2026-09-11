# Article Sync Worker

Worker package for processing article sync jobs from S3 markdown files.

## Exports

- `articleSyncWorker` - worker instance for the `article-sync` queue (concurrency 1).

## Related

- Queue surface: [../../queues/article-sync/README.md](../../queues/article-sync/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
