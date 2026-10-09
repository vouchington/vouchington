import { ServerResponse } from 'node:http'
import { vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'

// Observe real response-close callbacks and their returned quota-add promises. Keep the
// call-through spies installed until close work settles, including when the request fails.
export async function settleMeteredMcpResponses<T>(run: () => Promise<T>): Promise<T> {
  const gates: Array<Promise<PromiseSettledResult<void>>> = []
  const restores: Array<() => void> = []
  const failures: unknown[] = []
  let result!: T
  let actionFailed = false
  let actionFailure: unknown
  const registrationFailures = new Map<Promise<PromiseSettledResult<void>>, unknown>()
  try {
    const add = vi.spyOn(RateLimiter.prototype, 'add')
    restores.push(() => add.mockRestore())
    const once = ServerResponse.prototype.once
    const onceSpy = vi.spyOn(ServerResponse.prototype, 'once')
    restores.push(() => onceSpy.mockRestore())
    onceSpy.mockImplementation(function (this: ServerResponse, event, listener) {
      if (event !== 'close' || typeof listener !== 'function') {
        return once.call(this, event, listener as () => void)
      }
      const gate = Promise.withResolvers<void>()
      const observed = gate.promise.then<PromiseSettledResult<void>, PromiseSettledResult<void>>(
        () => ({ status: 'fulfilled', value: undefined }),
        err => ({ status: 'rejected', reason: err }),
      )
      gates.push(observed)
      try {
        return once.call(this, 'close', (...args: unknown[]) => {
          const started = add.mock.results.length
          const callbackFailures: unknown[] = []
          try {
            Reflect.apply(listener, this, args)
          } catch (err) {
            callbackFailures.push(err)
          }
          const startedAdds = add.mock.results
            .slice(started)
            .flatMap(entry => (entry.type === 'return' ? [entry.value as Promise<unknown>] : []))
          void Promise.allSettled(startedAdds).then(outcomes => {
            const errors = [...callbackFailures]
            for (const outcome of outcomes) {
              if (outcome.status === 'rejected') errors.push(outcome.reason)
            }
            if (errors.length === 1) gate.reject(errors[0])
            else if (errors.length > 1) {
              gate.reject(new AggregateError(errors, 'MCP response-close work failed'))
            } else gate.resolve()
          })
        })
      } catch (err) {
        registrationFailures.set(observed, err)
        gate.reject(err)
        throw err
      }
    })
    result = await run()
  } catch (err) {
    actionFailed = true
    actionFailure = err
    failures.push(err)
  } finally {
    const outcomes = await Promise.all(gates)
    for (const [index, outcome] of outcomes.entries()) {
      const gate = gates[index]!
      // A registration failure propagated by run is one causal failure, not two.
      const propagatedRegistrationFailure =
        actionFailed &&
        registrationFailures.has(gate) &&
        Object.is(registrationFailures.get(gate), actionFailure)
      if (outcome.status === 'rejected' && !propagatedRegistrationFailure) {
        failures.push(outcome.reason)
      }
    }
    for (const restore of restores.toReversed()) {
      try {
        restore()
      } catch (err) {
        failures.push(err)
      }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'MCP usage observation failed')
  return result
}
