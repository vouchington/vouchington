# Bloom Filters Worker

Source entrypoint: [backend/workers/bloom-filters/README.md](../../../../../../backend/workers/bloom-filters/README.md)

Worker package for admin and failure-triggered Bloom rebuilds. Missed additions are repaired by the existing entity-listener reconciliation window; no full rebuild is scheduled.

## Exports

- `bloomFilters` - worker instance for the `bloom-filters` queue.

## Related

- Queue surface: [../../queues/bloom-filters/README.md](../../bloom-filters/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
