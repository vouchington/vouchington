# Images Worker

Worker-only code for the images system. `@vouchington/media` provides the S3-body-to-private-temp-file
utility. This package owns the durable metadata workflow, Sharp metadata JSON, format policy,
terminal PubSub updates, and post-finalize moderation handoff.

This package exists to keep `sharp` (a ~30 MiB native binary) out of the API deploy tree. Only `@entrypoints/worker-cpu` declares this as a production dependency. `@queues/images` lists it as a devDependency (TypeScript path resolution only) and `backend/package.json` includes it for dev scripts — neither pulls `sharp` into the API deploy tree because `pnpm deploy --prod` excludes devDependencies. The API-safe queue/enqueue/config/schedule surface lives in [`@queues/images`](../images/README.md).

## Exports

- `images` — the `Worker` instance that processes `cleanup-abandoned-uploads` and
  `extract-metadata` jobs from the `images` queue.

`extract-metadata` receives only `{ id }` and reads the image row from the PostgreSQL primary. It
requires the stored key to match the persisted SHA-256 digest before Sharp reads the canonical
object. Invalid storage state becomes a terminal failure; provider failures remain retryable.

The processor function `processExtractImageMetadata` is internal to this package. It is not part of the public export map but is accessible via relative import in tests within this package.

## Related

- Shared queue surface (API-safe): [../images/README.md](../images/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Images service: [../../services/images/README.md](../../services/images/README.md)
