import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createOwnedWorkerFailures } from './election-vote-stats-worker-errors.mts'

describe('owned worker failure retention', () => {
  it('fails cleanup for an error received after the stop promise settled', async () => {
    const stop = Promise.withResolvers<void>()
    const failures = createOwnedWorkerFailures()
    const source = new EventEmitter()
    source.on('error', err => {
      failures.record(err)
      stop.reject(err)
    })
    stop.resolve()
    await expect(stop.promise).resolves.toBeUndefined()
    source.emit('error', new Error('late owned error'))
    expect(() => failures.finish()).toThrow('late owned error')
  })

  it('retains the primary error identity once when the same event rejected stop', () => {
    const failures = createOwnedWorkerFailures()
    const primary = new Error('primary owned error')
    failures.record(primary)
    let caught: unknown
    try {
      failures.finish({ error: primary })
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(primary)
  })

  it('keeps late worker and cleanup errors in order after the original cause', () => {
    const failures = createOwnedWorkerFailures()
    const primary = new Error('primary')
    const late = new Error('late worker')
    const cleanup = new Error('cleanup')
    failures.record(late)
    failures.record(cleanup)
    let caught: unknown
    try {
      failures.finish({ error: primary })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AggregateError)
    expect(caught).toMatchObject({ cause: primary, errors: [primary, late, cleanup] })
  })
})
