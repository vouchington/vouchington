# Explicit resource management

[Back to TypeScript Standards](typescript-standards.md)

Use `using` or `await using` when one scope acquires a resource, remains its sole owner, and
leaving that scope has the same cleanup meaning on success and failure. Prefer Node's native
disposable resources over a hand-written `try`/`finally` when those conditions hold.

```ts
await using file = await open(path, 'r')
await using directory = await mkdtempDisposable(prefix)
```

The block owns the file handle or temporary directory. The resource cannot outlive the block, and
native disposal closes the handle or recursively removes the directory if the body returns or
throws. Keep an explicit close or destroy when a surrounding operation needs a particular order,
such as ending a write stream before its containing temporary directory is removed.

## Selection rule

Convert a cleanup path only when all of these are true:

1. Acquisition and final release are in one lexical scope.
2. No caller, child task, callback, or returned value retains ownership after that scope exits.
3. Native disposal preserves the existing success, error, and shutdown behavior.
4. A focused test observes cleanup after both a successful and failing operation when that boundary
   does not already own the contract.

Do not infer success from disposal. Resources whose final action depends on whether work succeeded
need an explicit terminal operation before the scope exits.

Native disposal also preserves both failures when the scope body and cleanup throw: the cleanup
failure is `SuppressedError.error`, and the body failure is `SuppressedError.suppressed`. This is an
intentional diagnostic improvement over a `finally` cleanup failure replacing the body failure.

## Deliberate exclusions

The following resources are not mechanical `using` candidates because their lifetime is shared,
transferred, or has cleanup semantics broader than simple release:

| Resource                                             | Why it remains explicit                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL pools and clients                         | Pool health, transaction outcome, and destroy-versus-release decisions are lifecycle state.                        |
| Advisory locks                                       | Unlocking is separate from client release and must retain lock ownership semantics.                                |
| Cursors and async generators                         | Consumers control iteration lifetime and generator `finally` already owns closure.                                 |
| Streams and readline                                 | Async disposal aborts; it does not replace graceful completion, draining, or pipeline error handling.              |
| Browser pages and sessions                           | Ownership crosses helpers and cleanup order/error handling is intentional.                                         |
| HTTP servers and listeners                           | Shutdown includes connection draining, timeouts, and custom close behavior.                                        |
| Valkey subscriptions and GlideMQ                     | Subscription cleanup also owns request listeners and counters; shared clients add registry and force-close policy. |
| MCP transports                                       | Request and server lifetimes have ordered close behavior beyond transport disposal.                                |
| Ownership-transferred temporary files                | A caller or asynchronous consumer owns deletion after the creating scope returns.                                  |
| Shared test fixtures and reference-counted resources | Cleanup waits for multiple users rather than one lexical owner.                                                    |

When an excluded resource gains a native disposable API, re-evaluate it against the selection rule
instead of converting it solely for syntactic consistency.

## Related

- [PostgreSQL data store](../../../backend/data-stores/psql/README.md)
- [Graceful shutdown](graceful-shutdown.md)
- [Tests and checks](../../development/tests.md)
