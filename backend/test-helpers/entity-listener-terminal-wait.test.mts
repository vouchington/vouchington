import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { observeElectionTerminalSource } from './election-vote-stats-events.mts'
import {
  createEntityListenerLifetime,
  observeEntityListenerWork,
  waitForEntityListenerTerminal,
} from './entity-listener-terminal-wait.mts'

// Exercise the public terminal-event port, not a fabricated SDK job or physical worker proof.
describe('bounded entity listener terminal observation', () => {
  it('unblocks a memoized pending join on teardown and then detaches its source', async () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const teardown = new AbortController()
    const reason = new Error('Owned test finished')
    let closing: Promise<PromiseSettledResult<unknown>[]> | undefined
    const finish = () =>
      (closing ??= Promise.allSettled([
        waitForEntityListenerTerminal(observer, 'owned-missing-terminal', teardown.signal),
      ]))
    const bodyCleanup = finish()
    teardown.abort(reason)
    let results: PromiseSettledResult<unknown>[]
    try {
      results = await finish()
      expect(finish()).toBe(bodyCleanup)
    } finally {
      await observer.close()
    }
    expect(results).toEqual([{ status: 'rejected', reason }])
    expect(events.listenerCount('completed')).toBe(0)
    expect(events.listenerCount('failed')).toBe(0)
    expect(events.listenerCount('error')).toBe(0)
  })

  it('accepts an exact terminal buffered before the bounded wait', async () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const teardown = new AbortController()
    try {
      events.emit('completed', { jobId: 'owned-buffered-terminal' })
      await expect(
        waitForEntityListenerTerminal(observer, 'owned-buffered-terminal', teardown.signal),
      ).resolves.toEqual({ id: 'owned-buffered-terminal', failed: false })
    } finally {
      teardown.abort()
      await observer.close()
    }
  })

  it('rejects an already closed lifetime with its exact reason', async () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const teardown = new AbortController()
    const reason = { kind: 'owned-scope-closed' }
    teardown.abort(reason)
    try {
      await expect(waitForEntityListenerTerminal(observer, 'owned', teardown.signal)).rejects.toBe(
        reason,
      )
    } finally {
      await observer.close()
    }
  })

  it('preserves an undefined source rejection through observation and close', async () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const teardown = new AbortController()
    const waiting = Promise.allSettled([
      waitForEntityListenerTerminal(observer, 'owned', teardown.signal),
    ])
    events.emit('error', undefined)
    const observed = await waiting
    const closed = await Promise.allSettled([observer.close()])
    expect(observed).toEqual([{ status: 'rejected', reason: undefined }])
    expect(closed).toEqual([{ status: 'rejected', reason: undefined }])
    expect(events.listenerCount('error')).toBe(0)
  })
  it('bounds a pending original admission observation while retaining its later rejection', async () => {
    const original = Promise.withResolvers<void>()
    const teardown = new AbortController()
    const deadlineFailure = new Error('Owned admission deadline elapsed')
    const producerFailure = { kind: 'late-original-admission-rejection' }
    const originalSettlement = Promise.allSettled([original.promise])
    const observed = Promise.allSettled([
      observeEntityListenerWork(original.promise, teardown.signal),
    ])
    try {
      teardown.abort(deadlineFailure)
      expect(await observed).toEqual([{ status: 'rejected', reason: deadlineFailure }])
    } finally {
      original.reject(producerFailure)
    }
    expect(await originalSettlement).toEqual([{ status: 'rejected', reason: producerFailure }])
  })

  it('observes a raw rejection from work started after the lifetime already closed', async () => {
    const teardown = new AbortController()
    const reason = new Error('Owned lifetime already closed')
    teardown.abort(reason)
    const original = Promise.withResolvers<void>()
    const observed = Promise.allSettled([
      observeEntityListenerWork(original.promise, teardown.signal),
    ])
    original.reject(undefined)
    expect(await observed).toEqual([{ status: 'rejected', reason }])
    expect(await Promise.allSettled([original.promise])).toEqual([
      { status: 'rejected', reason: undefined },
    ])
  })

  it('aborts a genuinely pending owner before the real test-finished hook joins its memoized cleanup', () => {
    const events = Object.assign(new EventEmitter(), {
      async waitUntilReady() {},
      async close() {},
    })
    const observer = observeElectionTerminalSource(events)
    const lifetime = createEntityListenerLifetime()
    const deadline = lifetime.signal
    let closing: Promise<PromiseSettledResult<unknown>[]> | undefined
    const finish = () =>
      (closing ??= Promise.allSettled([
        waitForEntityListenerTerminal(observer, 'owned-without-terminal', deadline),
      ]))
    lifetime.register(async () => {
      let results: PromiseSettledResult<unknown>[]
      try {
        expect(deadline.aborted).toBe(true)
        results = await finish()
      } finally {
        await observer.close()
      }
      expect(results).toEqual([{ status: 'rejected', reason: deadline.reason }])
      expect(events.listenerCount('completed')).toBe(0)
      expect(events.listenerCount('failed')).toBe(0)
      expect(events.listenerCount('error')).toBe(0)
    })
    void finish()
  })
})
