# Entity Listeners Worker

Worker package for entity-created, updated, deleted, and related listener jobs.

## Exports

- `entitiesListeners` - worker instance for the `entity-listeners` queue.
- `reconcileEntities` streams the durable checkpoint window and processes candidates before
  advancing it; `reconcileEntity` re-derives current state.
- Post-created recovery awaits community-moderation and story-agent queue delivery, so a failed
  enqueue leaves the durable reconciliation checkpoint retryable. Raw-link crawl recovery reads
  immutable creation provenance from `posts` whenever present. During the bounded old-writer
  expand/contract window only, NULL provenance falls back to the prior elected related-URL row;
  remove that fallback after old-writer-created events have drained through reconciliation. No
  broad backfill is needed or performed.
- `processReconcilePostCategoryFinalizations` drains 25 durable post-category rows per page and
  queues one serialized continuation after a full success; the five-minute schedule recovers lost
  continuation dispatches.

## Related

- Queue surface: [../../queues/entity-listeners/README.md](../../queues/entity-listeners/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
