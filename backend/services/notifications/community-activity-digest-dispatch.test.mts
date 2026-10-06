import { describe, expect, it } from 'vitest'
import {
  clearTestCommunityActivityDigestWorkItems,
  getTestCommunityActivityDigestWorkItems,
  expireTestCommunityActivityDigestWorkItemLease,
} from '@voucha/test-helpers'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import {
  completeCommunityActivityDigestWorkItem,
  claimCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
  renewCommunityActivityDigestWorkItem,
  releaseCommunityActivityDigestWorkItem,
} from './community-activity-digest-dispatch.mts'

describe('community activity digest work items', () => {
  it('initializes and fills ordered gaps while retaining the completed high-water mark', async () => {
    if (getIsolatedDatabaseCaseMode('digest-work-window-gaps') === 'parent') {
      await runIsolatedDatabaseCase('digest-work-window-gaps')
      return
    }
    await clearTestCommunityActivityDigestWorkItems()
    const firstStart = new Date('2035-07-09T00:00:00.000Z')
    await expect(prepareCommunityActivityDigestWorkItems(firstStart)).resolves.toEqual([
      { windowStart: firstStart, windowEnd: new Date('2035-07-16T00:00:00.000Z') },
    ])
    const leaseToken = await claimCommunityActivityDigestWorkItem(firstStart)
    expect(leaseToken).toBeTypeOf('string')
    if (!leaseToken) throw new Error('Expected a digest lease')
    await expect(prepareCommunityActivityDigestWorkItems(firstStart)).resolves.toEqual([])
    await expect(completeCommunityActivityDigestWorkItem(firstStart, leaseToken)).resolves.toBe(
      true,
    )
    const pending = await prepareCommunityActivityDigestWorkItems(
      new Date('2035-07-30T00:00:00.000Z'),
    )
    expect(pending.map(window => window.windowStart.toISOString())).toEqual([
      '2035-07-16T00:00:00.000Z',
      '2035-07-23T00:00:00.000Z',
      '2035-07-30T00:00:00.000Z',
    ])
    expect(await getTestCommunityActivityDigestWorkItems()).toHaveLength(4)
  }, 240_000)

  it('fences stale batch chains after expiry and successor takeover', async () => {
    if (getIsolatedDatabaseCaseMode('digest-work-lease-takeover') === 'parent') {
      await runIsolatedDatabaseCase('digest-work-lease-takeover')
      return
    }
    await clearTestCommunityActivityDigestWorkItems()
    const windowStart = new Date('2035-08-06T00:00:00.000Z')
    await prepareCommunityActivityDigestWorkItems(windowStart)
    const firstToken = await claimCommunityActivityDigestWorkItem(windowStart)
    if (!firstToken) throw new Error('Expected first digest lease')
    await expect(claimCommunityActivityDigestWorkItem(windowStart)).resolves.toBeNull()
    await expireTestCommunityActivityDigestWorkItemLease(windowStart, firstToken)
    const successorToken = await claimCommunityActivityDigestWorkItem(windowStart)
    if (!successorToken) throw new Error('Expected successor digest lease')
    expect(successorToken).not.toBe(firstToken)
    await releaseCommunityActivityDigestWorkItem(windowStart, firstToken)
    await expect(renewCommunityActivityDigestWorkItem(windowStart, firstToken)).resolves.toBe(false)
    await expect(completeCommunityActivityDigestWorkItem(windowStart, firstToken)).resolves.toBe(
      false,
    )
    await expect(renewCommunityActivityDigestWorkItem(windowStart, successorToken)).resolves.toBe(
      true,
    )
    await expect(
      completeCommunityActivityDigestWorkItem(windowStart, successorToken),
    ).resolves.toBe(true)
    await expect(prepareCommunityActivityDigestWorkItems(windowStart)).resolves.toEqual([])
  }, 240_000)
})
