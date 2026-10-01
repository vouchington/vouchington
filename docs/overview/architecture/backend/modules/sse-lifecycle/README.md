# @modules/sse-lifecycle

Source entrypoint: [backend/modules/sse-lifecycle/README.md](../../../../../../backend/modules/sse-lifecycle/README.md)

The signal for an SSE cycle that reached its duration bound. It lives in its own module so SSE
consumers can import it without depending on the API's SSE helpers.

## Exports

### `SSE_CYCLE_EXPIRED`

The string `'sse-cycle-expired'`. `startSSE()` (`backend/api/sse-helpers.mts`) aborts its
`lifecycleSignal` with this reason when the cycle timer fires, for every SSE stream. Ordinary
client disconnects abort without a reason, so a consumer can tell routine cycle expiry from a
disconnect.

## Related

- Parent: [../README.md](../README.md)
- SSE conventions: [backend/api/AGENTS.md](../../../../../../backend/api/AGENTS.md)
- SSE duration bounds: [runtime-timeouts.md](../../../../../development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot)
