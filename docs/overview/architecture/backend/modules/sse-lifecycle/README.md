# @modules/sse-lifecycle

Source entrypoint: [backend/modules/sse-lifecycle/README.md](../../../../../../backend/modules/sse-lifecycle/README.md)

The signal for an SSE cycle that reached its duration bound. Neither the API nor the chat agent
owns it, so both import it from this module.

## Exports

### `SSE_CYCLE_EXPIRED`

The string `'sse-cycle-expired'`. It has two roles that share one value:

- **Abort reason.** `startSSE()` (`backend/api/sse-helpers.mts`) aborts its `lifecycleSignal` with
  this reason when the cycle timer fires, for every SSE stream. Ordinary client disconnects abort
  without a reason, so a consumer can tell routine cycle expiry from a disconnect.
- **Chat abort reason.** `@agents/chat` still treats it as a retryable expiry when it aborts a
  stream. No route or worker job carries it across processes now that the hosted chat transport is
  removed; the remaining chat agent code is deleted by the later chat-agent removal.

The value must not change while either role still reads it.

## Related

- Parent: [../README.md](../README.md)
- SSE conventions: [backend/api/AGENTS.md](../../../../../../backend/api/AGENTS.md)
- SSE duration bounds: [runtime-timeouts.md](../../../../../development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot)
