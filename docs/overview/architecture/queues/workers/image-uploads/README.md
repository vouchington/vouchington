# Images Worker

Source entrypoint: [backend/workers/image-uploads/README.md](../../../../../../backend/workers/image-uploads/README.md)

Worker-only code for the images system. `@vouchington/media` provides the S3-body-to-private-temp-file
utility. This package owns the durable metadata workflow, Sharp metadata JSON, format policy,
terminal PubSub updates, and post-finalize moderation handoff.

This package exists to keep `sharp` (a ~30 MiB native binary) out of the API deploy tree. Only `@entrypoints/worker-cpu` declares this as a production dependency. `@queues/image-uploads` lists it as a devDependency (TypeScript path resolution only) and `backend/package.json` includes it for dev scripts — neither pulls `sharp` into the API deploy tree because `pnpm deploy --prod` excludes devDependencies. The API-safe queue/enqueue/config surface lives in [`@queues/image-uploads`](README.md).

## Exports

- `imageUploads` — the worker instance for `extract-metadata` on `image-uploads`.

`extract-metadata` receives only `{ id }` and reads the image row from the PostgreSQL primary. It
requires the stored key to match the persisted SHA-256 digest before Sharp reads the canonical
object. Invalid storage state becomes a terminal failure; provider failures remain retryable.

The processor function `processExtractImageMetadata` is internal to this package. It is not part of the public export map but is accessible via relative import in tests within this package.

## Worker coverage

[`image-uploads.real-glide.mock.test.mts`](../../../../../../backend/workers/image-uploads/workers/image-uploads.real-glide.mock.test.mts)
exercises metadata dispatch over a real GlideMQ queue, including persisted completion and image-state
publication while `content-analysis` has an active backlog. Fixture and queue ownership follow
[rule R1](../../../../../development/tests.md#test-suite-rules).

## Related

- Shared queue surface (API-safe): [../image-uploads/README.md](../image-uploads/README.md)
- Parent: [../AGENTS.md](../../../../../../backend/workers/AGENTS.md)
- Images service: [../../services/images/README.md](../../../services/images/README.md)
