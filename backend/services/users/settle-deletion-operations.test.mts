import { describe, expect, it } from 'vitest'
import { settleUserDeletionOperations } from './settle-deletion-operations.mts'

describe('user deletion operation completion', () => {
  it('completes successful operations', async () => {
    await expect(
      settleUserDeletionOperations([Promise.resolve()], 'failed'),
    ).resolves.toBeUndefined()
  })
  it.each([undefined, new Error('original')])(
    'preserves a lone rejected reason %s',
    async reason => {
      const rejected = Promise.withResolvers<never>()
      rejected.reject(reason)
      const result = await settleUserDeletionOperations([rejected.promise], 'failed').then(
        () => ({ ok: true as const, err: undefined }),
        err => ({ ok: false as const, err }),
      )
      expect(result.ok).toBe(false)
      expect(result.err).toBe(reason)
    },
  )
  it('retains distinct failures in operation order and deduplicates their identity', async () => {
    const first = new Error('first')
    const second = new Error('second')
    const rejectedUndefined = Promise.withResolvers<never>()
    rejectedUndefined.reject(undefined)
    const result = await settleUserDeletionOperations(
      [
        Promise.reject(first),
        rejectedUndefined.promise,
        Promise.reject(first),
        Promise.reject(second),
        rejectedUndefined.promise,
      ],
      'multiple failed',
    ).then(
      () => ({ errors: [] as unknown[] }),
      err => err as AggregateError,
    )
    expect(result).toBeInstanceOf(AggregateError)
    expect(result.errors).toHaveLength(3)
    expect(result.errors[0]).toBe(first)
    expect(result.errors[1]).toBeUndefined()
    expect(result.errors[2]).toBe(second)
  })
  it('settles a later started operation before propagating an earlier failure', async () => {
    const later = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    let finished = false
    const operation = (async () => {
      started.resolve()
      await later.promise
      finished = true
    })()
    const reason = new Error('first failed')
    const result = settleUserDeletionOperations(
      [Promise.reject(reason), operation],
      'failed',
    ).catch(err => ({ err, finished }))
    await started.promise
    later.resolve()
    expect(await result).toEqual({ err: reason, finished: true })
  })
})
