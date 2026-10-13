import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { observeElectionTerminalSource } from './election-vote-stats-events.mts'

// Port-level error controls, not evidence of physical QueueEvents delivery.
describe('owned terminal observer errors', () => {
  it('retains errors after the last successful wait through cleanup in observation order', async () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const first = new Error('First late transport failure')
    const second = { reason: 'Second raw transport failure' }
    let primary: unknown
    let failed = false
    let closed: PromiseSettledResult<void> | undefined
    try {
      events.emit('completed', { jobId: 'owned' })
      await expect(observer.wait('owned')).resolves.toEqual({ id: 'owned', failed: false })
      events.emit('error', first)
      events.emit('error', second)
      await expect(observer.wait('another')).rejects.toBe(first)
    } catch (err) {
      primary = err
      failed = true
    } finally {
      ;[closed] = await Promise.allSettled([observer.close()])
    }
    if (failed) throw primary
    expect(closed?.status).toBe('rejected')
    if (closed?.status !== 'rejected') throw new Error('Expected retained observer failure')
    expect(closed.reason.errors).toEqual([first, second])
    expect(closed.reason.cause).toBe(first)
    expect(events.listenerCount('error')).toBe(0)
  })

  it('retains an error emitted during close before the close rejection', async () => {
    const duringClose = new Error('Transport error during close')
    const closeFailure = new Error('Close rejected')
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {
        events.emit('error', duringClose)
        throw closeFailure
      },
    })
    const observer = observeElectionTerminalSource(events)
    const [closed] = await Promise.allSettled([observer.close()])
    expect(closed?.status).toBe('rejected')
    if (closed?.status !== 'rejected') throw new Error('Expected close failure')
    expect(closed.reason.errors).toEqual([duringClose, closeFailure])
    expect(closed.reason.cause).toBe(duringClose)
    expect(events.listenerCount('error')).toBe(0)
    await expect(observer.close()).rejects.toBe(closed.reason)
  })
})
