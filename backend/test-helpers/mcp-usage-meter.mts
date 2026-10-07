import { ServerResponse } from 'node:http'
import { vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'

// settleUsage runs from response close without an awaited request promise. Wait for every quota
// add started by that close listener before inspecting the Valkey bucket.
export async function settleMeteredMcpResponses<T>(run: () => Promise<T>): Promise<T> {
  const gates: Promise<void>[] = []
  const add = vi.spyOn(RateLimiter.prototype, 'add')
  const once = ServerResponse.prototype.once
  const onceSpy = vi.spyOn(ServerResponse.prototype, 'once').mockImplementation(function (
    this: ServerResponse,
    event,
    listener,
  ) {
    if (event !== 'close' || typeof listener !== 'function') {
      return once.call(this, event, listener as () => void)
    }
    const gate = Promise.withResolvers<void>()
    gates.push(gate.promise)
    return once.call(this, 'close', (...args: unknown[]) => {
      const started = add.mock.results.length
      Reflect.apply(listener, this, args)
      const settledAdds = add.mock.results
        .slice(started)
        .flatMap(result => (result.type === 'return' ? [result.value as Promise<unknown>] : []))
      void Promise.allSettled(settledAdds).then(() => {
        gate.resolve()
      })
    })
  })
  try {
    const result = await run()
    await Promise.all(gates)
    return result
  } finally {
    onceSpy.mockRestore()
    add.mockRestore()
  }
}
