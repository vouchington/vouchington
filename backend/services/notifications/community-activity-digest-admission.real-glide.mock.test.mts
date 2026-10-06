import { describe, expect, it, vi } from 'vitest'
import { processCommunityActivityDigestScheduleTick } from '../../workers/notifications/processors/community-activity-digest-schedule.mts'
import {
  getTestCommunityActivityDigestWorkItems,
  insertTestCommunityActivityDigestWorkItem,
  readNextTestCommunityActivityDigestWindowStart,
  withTestCommunityActivityDigestLock,
} from '@voucha/test-helpers'
import {
  claimCommunityActivityDigestWorkItem,
  completeCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
} from './community-activity-digest-dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('community activity digest work items', () => {
  it('releases the durable lease when queue admission fails', async () => {
    await withTestCommunityActivityDigestLock(async () => {
      const windowStart = await readNextTestCommunityActivityDigestWindowStart()
      const foreignStart = new Date(windowStart.getTime() - 3 * 24 * 60 * 60 * 1000)
      await expect(
        processCommunityActivityDigestScheduleTick(
          {},
          {
            prepareCommunityActivityDigestWorkItems: async () => {
              const windows = await prepareCommunityActivityDigestWorkItems(windowStart, [
                windowStart,
              ])
              await insertTestCommunityActivityDigestWorkItem(foreignStart)
              return windows
            },
            enqueueCommunityActivityDigestDispatch: async () => {
              throw new Error('notifications queue closed')
            },
          },
        ),
      ).rejects.toThrow(/clos/i)
      const stored = await getTestCommunityActivityDigestWorkItems()
      expect(
        stored.find(row => row.window_starts_at.toISOString() === windowStart.toISOString()),
      ).toMatchObject({ lease_token: null, completed_at: null, attempt_count: 1 })
      expect(
        stored.find(row => row.window_starts_at.toISOString() === foreignStart.toISOString()),
      ).toMatchObject({ lease_token: null, completed_at: null, attempt_count: 0 })
      const successor = await claimCommunityActivityDigestWorkItem(windowStart)
      expect(successor).toBeTypeOf('string')
      if (!successor) throw new Error('Expected released digest work to be immediately claimable')
      await expect(completeCommunityActivityDigestWorkItem(windowStart, successor)).resolves.toBe(
        true,
      )
    })
  })
})
