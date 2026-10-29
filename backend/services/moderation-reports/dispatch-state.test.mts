import { describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestReportJudgement } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getUndispatchedJudgements } from './dispatch-state.mts'
import { moderationReportsWorkConfig } from './work-limits.mts'

describe('getUndispatchedJudgements', () => {
  it('recovers a judgement on the next five-minute sweep after it was too young', async () => {
    const user = await createTestUser()
    const judgementId = await insertTestReportJudgement({
      entityType: 'user',
      entityId: user.id,
    })
    const createdAt = Date.now()
    const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
      dispatch_min_age_seconds: 600,
      dispatch_max_age_seconds: 601,
      dispatch_batch_size: 2000,
    })
    const now = vi.spyOn(Date, 'now')
    try {
      now.mockReturnValue(createdAt + 9.5 * 60 * 1000)
      expect(await getUndispatchedJudgements()).not.toContainEqual(
        expect.objectContaining({ judgement_id: judgementId }),
      )
      now.mockReturnValue(createdAt + 14.5 * 60 * 1000)
      expect(await getUndispatchedJudgements()).toContainEqual(
        expect.objectContaining({ judgement_id: judgementId }),
      )
    } finally {
      now.mockRestore()
      restore()
    }
  })
})
