# Moderation Signals Worker

Source entrypoint: [backend/workers/moderation-signals/README.md](../../../../../../backend/workers/moderation-signals/README.md)

Handlers for the `moderation-signals` domain of the shared [`background` worker](../background/README.md).

## Exports

- `moderationSignalsHandlers` - the spam detection and ban-evasion handlers the background worker
  registers by job name.

## Related

- Queue surface: [../../moderation-signals/README.md](../../moderation-signals/README.md)
- Service logic: [../../../services/communities/ban-evasion/](../../../../../../backend/services/communities/ban-evasion/)
- Worker entrypoint: [../../../backend/entrypoints/worker-io/README.md](../../../../backend/entrypoints/worker-io/README.md)
