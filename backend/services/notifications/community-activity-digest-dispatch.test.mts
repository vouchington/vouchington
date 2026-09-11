import { describe, expect, it } from 'vitest'
import {
  clearTestCommunityActivityDigestDispatchWindows,
  getTestCommunityActivityDigestDispatchWindows,
  setTestCommunityActivityDigestDispatchWindowEnqueuedAt,
} from '@voucha/test-helpers'
import {
  markCommunityActivityDigestDispatchWindowCompleted,
  markCommunityActivityDigestDispatchWindowEnqueued,
  prepareCommunityActivityDigestDispatchWindows,
} from './community-activity-digest-dispatch.mts'

describe('community activity digest dispatch windows', () => {
  it('initializes, fills ordered gaps, retains pending rows, and removes marked rows', async () => {
    await clearTestCommunityActivityDigestDispatchWindows()
    const firstStart = new Date('2035-07-09T00:00:00.000Z')
    await expect(prepareCommunityActivityDigestDispatchWindows(firstStart)).resolves.toEqual([
      {
        windowStart: firstStart,
        windowEnd: new Date('2035-07-16T00:00:00.000Z'),
      },
    ])
    await expect(prepareCommunityActivityDigestDispatchWindows(firstStart)).resolves.toHaveLength(1)
    await markCommunityActivityDigestDispatchWindowEnqueued(firstStart)
    await expect(prepareCommunityActivityDigestDispatchWindows(firstStart)).resolves.toEqual([])

    const pending = await prepareCommunityActivityDigestDispatchWindows(
      new Date('2035-07-30T00:00:00.000Z'),
    )
    expect(pending.map(window => window.windowStart.toISOString())).toEqual([
      '2035-07-16T00:00:00.000Z',
      '2035-07-23T00:00:00.000Z',
      '2035-07-30T00:00:00.000Z',
    ])
    expect(await getTestCommunityActivityDigestDispatchWindows()).toHaveLength(4)
  })

  it('requeues stale accepted work until its complete batch chain is durable', async () => {
    await clearTestCommunityActivityDigestDispatchWindows()
    const windowStart = new Date('2035-08-06T00:00:00.000Z')
    const windowEnd = new Date('2035-08-13T00:00:00.000Z')
    await prepareCommunityActivityDigestDispatchWindows(windowStart)
    await markCommunityActivityDigestDispatchWindowEnqueued(windowStart)
    await setTestCommunityActivityDigestDispatchWindowEnqueuedAt(
      windowStart,
      new Date('2035-08-13T09:00:00.000Z'),
    )

    await expect(
      prepareCommunityActivityDigestDispatchWindows(
        windowStart,
        new Date('2035-08-13T10:00:00.000Z'),
      ),
    ).resolves.toEqual([{ windowStart, windowEnd }])

    await markCommunityActivityDigestDispatchWindowCompleted(windowStart)
    await expect(
      prepareCommunityActivityDigestDispatchWindows(
        windowStart,
        new Date('2035-08-20T00:00:00.000Z'),
      ),
    ).resolves.toEqual([])
  })
})
