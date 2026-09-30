# @modules/sse-lifecycle

Source entrypoint: [backend/modules/sse-lifecycle/README.md](../../../../../../backend/modules/sse-lifecycle/README.md)

The cross-process signal for an SSE cycle that reached its duration bound. Neither the API nor a
worker owns it, so both import it from this module.

## Exports

### `SSE_CYCLE_EXPIRED`

The string `'sse-cycle-expired'`. It has two roles that share one value:

- **Abort reason.** `startSSE()` (`backend/api/sse-helpers.mts`) aborts its `lifecycleSignal` with
  this reason when the cycle timer fires, for every SSE stream. Ordinary client disconnects abort
  without a reason, so a consumer can tell routine cycle expiry from a disconnect.
- **Job signal name.** When a hosted-chat SSE cycle expires, the API signals the worker job with
  this name so the worker aborts its generator and persists partial output with a retryable
  assistant error. See [the `ai_agents` queue](../../../queues/ai-agents/README.md).

The value is an external protocol between API and worker signals, so it must not change.

## Related

- Parent: [../README.md](../README.md)
- SSE conventions: [backend/api/AGENTS.md](../../../../../../backend/api/AGENTS.md)
- SSE duration bounds: [runtime-timeouts.md](../../../../../development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot)
