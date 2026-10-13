import { describe, expect, it } from 'vitest'
import { enqueueDeleteUserBookmarkBloomFilterBestEffort } from './enqueue-delete-user-bookmark-bloom-filter.mts'

describe('best-effort bookmark deletion enqueue', () => {
  it('awaits completion of the accepted enqueue', async () => {
    const queued = Promise.withResolvers<undefined>()
    const started = Promise.withResolvers<void>()
    let completed = false
    const result = enqueueDeleteUserBookmarkBloomFilterBestEffort('owned-user', {
      enqueue: data => {
        expect(data).toEqual({ userId: 'owned-user' })
        started.resolve()
        return queued.promise
      },
      reportError: () => {
        throw new Error('unexpected report')
      },
    }).then(() => {
      completed = true
      return undefined
    })
    await started.promise
    expect(completed).toBe(false)
    queued.resolve(undefined)
    await expect(result).resolves.toBeUndefined()
    expect(completed).toBe(true)
  })
  it('settles a factory-reported rejection without duplicate reporting', async () => {
    const reason = new Error('queue rejected')
    const reports: Error[] = []
    await expect(
      enqueueDeleteUserBookmarkBloomFilterBestEffort('owned-user', {
        enqueue: async () => {
          reports.push(reason)
          throw reason
        },
        reportError: err => {
          reports.push(err)
        },
      }),
    ).resolves.toBeUndefined()
    expect(reports).toEqual([reason])
  })
  it('reports a synchronous Error exactly once with original identity', async () => {
    const reason = new Error('synchronous failure')
    const reports: Error[] = []
    await expect(
      enqueueDeleteUserBookmarkBloomFilterBestEffort('owned-user', {
        enqueue: () => {
          throw reason
        },
        reportError: err => {
          reports.push(err)
        },
      }),
    ).resolves.toBeUndefined()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toBe(reason)
  })
  it('converts a synchronous non-Error reason and reports exactly once', async () => {
    const reports: Error[] = []
    await expect(
      enqueueDeleteUserBookmarkBloomFilterBestEffort('owned-user', {
        enqueue: () => {
          // A non-Error synchronous queue failure must be converted and reported exactly once.
          // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error
          throw undefined
        },
        reportError: err => {
          reports.push(err)
        },
      }),
    ).resolves.toBeUndefined()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toBeInstanceOf(Error)
    expect(reports[0]).toEqual(new Error('undefined'))
  })
})
