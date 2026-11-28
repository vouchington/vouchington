import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { waitForEmitterEvent, waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

describe('real GlideMQ terminal event deadline', () => {
  it('rejects a stalled completed, failed, or drained wait with a named deadline', async () => {
    const pending = Promise.withResolvers<'completed'>()
    await expect(waitForRealGlideEvent(pending.promise, 'GlideMQ job fixture', 50)).rejects.toThrow(
      'GlideMQ job fixture did not settle within 50ms',
    )
  })

  it('returns the terminal state when the worker event arrives first', async () => {
    const pending = Promise.withResolvers<'failed'>()
    const waiting = waitForRealGlideEvent(pending.promise, 'GlideMQ job fixture', 1_000)
    pending.resolve('failed')
    await expect(waiting).resolves.toBe('failed')
  })

  it('preserves a worker rejection that happens before the deadline', async () => {
    const pending = Promise.withResolvers<never>()
    const reason = new Error('worker failed closed')
    const waiting = waitForRealGlideEvent(pending.promise, 'GlideMQ job fixture', 1_000)
    pending.reject(reason)
    await expect(waiting).rejects.toBe(reason)
  })

  it('rejects a stalled event wait with a message naming the event and stops listening', async () => {
    const emitter = new EventEmitter()
    await expect(waitForEmitterEvent(emitter, 'delay-changed', 50)).rejects.toThrow(
      'delay-changed event did not settle within 50ms',
    )
    expect(emitter.listenerCount('delay-changed')).toBe(0)
  })

  it('resolves with the first payload of an emitted event and stops listening', async () => {
    const emitter = new EventEmitter()
    const waiting = waitForEmitterEvent<{ jobId: string }>(emitter, 'delay-changed', 1_000)
    emitter.emit('delay-changed', { jobId: 'job-1' }, 'ignored')
    await expect(waiting).resolves.toEqual({ jobId: 'job-1' })
    expect(emitter.listenerCount('delay-changed')).toBe(0)
  })
})
