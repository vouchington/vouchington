import { describe, expect, it } from 'vitest'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

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

  it('keeps a late terminal resolution from rejecting after the deadline', async () => {
    const pending = Promise.withResolvers<'completed'>()
    const observed = Promise.allSettled([
      waitForRealGlideEvent(pending.promise, 'GlideMQ job fixture', 50),
    ])
    const [result] = await observed
    expect(result).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({
        message: 'GlideMQ job fixture did not settle within 50ms',
      }),
    })
    pending.resolve('completed')
    await expect(pending.promise).resolves.toBe('completed')
  })
})
