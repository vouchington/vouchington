# Post Mentions Worker

Source entrypoint: [backend/workers/post-mentions/README.md](../../../../../../backend/workers/post-mentions/README.md)

Worker package for post mention processing jobs.

## Exports

- `postMentionsHandlers` - the `post-mentions` domain's handlers, served by the shared
  [`background` worker](../background/README.md) (no worker of its own).

## Related

- Queue surface: [../../queues/post-mentions/README.md](../../post-mentions/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
