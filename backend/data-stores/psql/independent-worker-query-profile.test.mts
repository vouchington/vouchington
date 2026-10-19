import { describe, expect, it } from 'vitest'
import {
  createRequestQueryProfile,
  recordRequestQueryTiming,
  runIndependentWorker,
} from './request-query-profile.mts'
import { findUnbaselinedRepeats } from './request-query-profile-baseline.mts'

const timing = { durationMs: 0 }
const identity = (id: string) => ({ queue: 'profile-contract', jobs: [{ id, name: 'owned' }] })

describe('independent worker query profiles', () => {
  it('keeps genuine request repeats guarded while retaining repeated worker queries separately', async () => {
    const request = createRequestQueryProfile()
    const result = await request.run(async () => {
      recordRequestQueryTiming({ ...timing, annotation: 'genuineRequestRepeat' })
      const worker = runIndependentWorker(identity('first'), () => {
        recordRequestQueryTiming({ ...timing, annotation: 'workerRepeat' })
        recordRequestQueryTiming({ ...timing, annotation: 'workerRepeat' })
        return 'unchanged business result'
      })
      expect(await worker.completion).toBe('unchanged business result')
      recordRequestQueryTiming({ ...timing, annotation: 'genuineRequestRepeat' })
      return worker
    })
    expect(request.summarize().totalQueries).toBe(2)
    expect(findUnbaselinedRepeats('GET /owned', request.summarize().repeats, [])).toEqual([
      { annotation: 'genuineRequestRepeat', count: 2 },
    ])
    expect(result.profile.queries()).toHaveLength(2)
    expect(result.profile.summarize().repeats).toEqual([{ annotation: 'workerRepeat', count: 2 }])
    expect(request.workerProfiles()).toEqual([result.profile])
  })

  it('retains worker timings without an active HTTP request', async () => {
    const worker = runIndependentWorker(identity('outside'), async () => {
      await Promise.resolve()
      recordRequestQueryTiming({ ...timing, annotation: 'outsideRequest' })
      return 17
    })
    expect(await worker.completion).toBe(17)
    expect(worker.profile.queries()).toEqual([
      expect.objectContaining({ annotation: 'outsideRequest' }),
    ])
  })

  it('keeps concurrently started jobs in distinct buckets', async () => {
    const request = createRequestQueryProfile()
    const workers = request.run(() =>
      ['first', 'second'].map(id =>
        runIndependentWorker(identity(id), async () => {
          await Promise.resolve()
          recordRequestQueryTiming({ ...timing, annotation: id })
        }),
      ),
    )
    await Promise.all(workers.map(worker => worker.completion))
    expect(request.summarize().totalQueries).toBe(0)
    expect(
      request.workerProfiles().map(worker => worker.queries().map(query => query.annotation)),
    ).toEqual([['first'], ['second']])
  })

  it('attributes nested jobs independently and restores the parent worker scope', async () => {
    const request = createRequestQueryProfile()
    const parent = request.run(() =>
      runIndependentWorker(identity('parent'), async () => {
        recordRequestQueryTiming({ ...timing, annotation: 'parentBefore' })
        const child = runIndependentWorker(identity('child'), () => {
          recordRequestQueryTiming({ ...timing, annotation: 'child' })
        })
        await child.completion
        recordRequestQueryTiming({ ...timing, annotation: 'parentAfter' })
      }),
    )
    await parent.completion
    expect(request.summarize().totalQueries).toBe(0)
    expect(request.workerProfiles()).toEqual([parent.profile])
    expect(parent.profile.queries().map(query => query.annotation)).toEqual([
      'parentBefore',
      'parentAfter',
    ])
    expect(
      parent.profile
        .workerProfiles()
        .map(worker => worker.queries().map(query => query.annotation)),
    ).toEqual([['child']])
  })

  it('preserves an undefined rejection and its already completed query', async () => {
    const request = createRequestQueryProfile()
    const worker = request.run(() =>
      runIndependentWorker(identity('rejected'), () => {
        recordRequestQueryTiming({ ...timing, annotation: 'beforeFailure' })
        return new Promise<never>((_resolve, reject) => {
          // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Verify exact passthrough of an undefined worker rejection.
          reject()
        })
      }),
    )
    await expect(worker.completion).rejects.toBeUndefined()
    expect(worker.profile.summarize().totalQueries).toBe(1)
    expect(request.summarize().totalQueries).toBe(0)
  })

  it('rejects absent physical identities before starting action effects', () => {
    let started = false
    expect(() =>
      runIndependentWorker({ queue: 'profile-contract', jobs: [] }, () => {
        started = true
      }),
    ).toThrow('actual queue/job identities')
    expect(started).toBe(false)
  })
})
