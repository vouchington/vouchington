import { describe, expect, it, onTestFinished } from 'vitest'
import {
  readTestCommunityActivityDigestCursor,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { overrideDynamicConfigFieldsForTest } from '../../test-helpers/dynamic-config.mts'
import { notificationsWorkConfig } from './work-limits.mts'
import {
  advanceCommunityActivityDigestCursor,
  isCommunityActivityDigestWindowComplete,
  prepareCommunityActivityDigestWindows,
} from './community-activity-digest-dispatch.mts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const start = new Date('2400-01-06T00:00:00.000Z')
const week = (count: number) => new Date(start.getTime() + count * WEEK_MS)

describe('community activity digest durable cursor', () => {
  it('creates the singleton lazily and recovers the same window before completion', async () => {
    await withTestCommunityActivityDigestCursor(null, async query => {
      const first = await prepareCommunityActivityDigestWindows(start, { query })
      expect(first).toEqual({
        windows: [{ windowStart: start, windowEnd: week(1) }],
        hasMore: false,
      })
      expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
      expect(await prepareCommunityActivityDigestWindows(start, { query })).toEqual(first)
      await advanceCommunityActivityDigestCursor(start, week(1), { query })
      expect(await prepareCommunityActivityDigestWindows(start, { query })).toEqual({
        windows: [],
        hasMore: false,
      })
    })
  })
  it('caps each catch-up page and resumes from the committed boundary', async () => {
    const restore = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      community_digest_windows_per_run: 2,
    })
    onTestFinished(restore)
    await withTestCommunityActivityDigestCursor(start, async query => {
      const first = await prepareCommunityActivityDigestWindows(week(4), { query })
      expect(first).toEqual({
        windows: [
          { windowStart: week(0), windowEnd: week(1) },
          { windowStart: week(1), windowEnd: week(2) },
        ],
        hasMore: true,
      })
      expect(await advanceCommunityActivityDigestCursor(week(0), week(1), { query })).toBe(true)
      expect(await advanceCommunityActivityDigestCursor(week(1), week(2), { query })).toBe(true)
      const second = await prepareCommunityActivityDigestWindows(week(4), { query })
      expect(second.windows.map(window => window.windowStart)).toEqual([week(2), week(3)])
      expect(second.hasMore).toBe(true)
      expect(await readTestCommunityActivityDigestCursor(query)).toEqual(week(2))
    })
  })

  it('does not skip a failed predecessor or move the cursor backward', async () => {
    await withTestCommunityActivityDigestCursor(start, async query => {
      expect(await advanceCommunityActivityDigestCursor(week(1), week(2), { query })).toBe(false)
      expect(await advanceCommunityActivityDigestCursor(week(0), week(2), { query })).toBe(false)
      expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
      expect(await isCommunityActivityDigestWindowComplete(week(1), { query })).toBe(false)
      expect(await advanceCommunityActivityDigestCursor(week(0), week(1), { query })).toBe(true)
      expect(await advanceCommunityActivityDigestCursor(week(0), week(1), { query })).toBe(false)
      expect(await readTestCommunityActivityDigestCursor(query)).toEqual(week(1))
      expect(await isCommunityActivityDigestWindowComplete(week(1), { query })).toBe(true)
    })
  })
})
