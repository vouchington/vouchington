import { describe, expect, it, vi } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import { processCommunityActivityDigestScheduleTick } from '../../workers/notifications/processors/community-activity-digest-schedule.mts'
import {
  clearTestCommunityActivityDigestWorkItems,
  getTestCommunityActivityDigestWorkItems,
} from '@voucha/test-helpers'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import {
  claimCommunityActivityDigestWorkItem,
  completeCommunityActivityDigestWorkItem,
} from './community-activity-digest-dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('community activity digest work items', () => {
  it('releases the durable lease when queue admission fails', async () => {
    if (getIsolatedDatabaseCaseMode('digest-work-admission-failure') === 'parent') {
      await runIsolatedDatabaseCase('digest-work-admission-failure')
      return
    }
    await clearTestCommunityActivityDigestWorkItems()
    // This child owns its queue namespace and process; closing it cannot affect sibling suites.
    await notifications.close()
    await expect(processCommunityActivityDigestScheduleTick({})).rejects.toThrow(/clos/i)
    const windows = await getTestCommunityActivityDigestWorkItems()
    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatchObject({ lease_token: null, completed_at: null, attempt_count: 1 })
    const windowStart = windows[0]!.window_starts_at
    const successor = await claimCommunityActivityDigestWorkItem(windowStart)
    expect(successor).toBeTypeOf('string')
    if (!successor) throw new Error('Expected released digest work to be immediately claimable')
    await expect(completeCommunityActivityDigestWorkItem(windowStart, successor)).resolves.toBe(
      true,
    )
  }, 240_000)
})
