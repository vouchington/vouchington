# Entity Listeners Worker

Source entrypoint: [backend/workers/entity-listeners/README.md](../../../../../../backend/workers/entity-listeners/README.md)

Worker package for entity-created, updated, deleted, and related listener jobs.

## Exports

- `entitiesListeners` - worker instance for the `entity-listeners` queue.
- `reconcileEntities` streams the durable checkpoint window and processes candidates before
  advancing it; `reconcileEntity` re-derives current state.
- Post-created recovery awaits community-moderation and story-agent queue delivery, so a failed
  enqueue leaves the durable reconciliation checkpoint retryable. Raw-link crawl recovery reads
  immutable creation provenance from `posts`; an elected related-URL row is not creation provenance.
  A link post without a source URL still recovers its canonical URL.
- `processReconcilePostCategoryFinalizations` drains 25 durable post-category rows per page and
  queues one serialized continuation after a full success; the five-minute schedule recovers lost
  continuation dispatches.

## Related

- Queue surface: [../../queues/entity-listeners/README.md](../../entity-listeners/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
