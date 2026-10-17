# Kagi Small Web Worker

Source entrypoint: [backend/workers/kagi-smallweb/README.md](../../../../../../backend/workers/kagi-smallweb/README.md)

Worker package for Kagi Small Web synchronization jobs.

## Exports

- `kagiSmallWebHandlers` - the domain's handlers for the shared
  [background worker](../background/README.md); there is no per-queue `Worker`.

## Related

- Queue surface: [../../queues/kagi-smallweb/README.md](../../kagi-smallweb/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
