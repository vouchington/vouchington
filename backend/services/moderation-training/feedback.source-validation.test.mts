import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport } from '@voucha/test-helpers'
import { recordModerationTrainingFeedback } from './feedback.mts'
import type { RecordModerationTrainingFeedbackInput } from './types.mts'

describe('moderation training feedback source validation', () => {
  it.each([
    ['moderation_report', 'moderationReportId'],
    ['moderation_appeal', 'moderationAppealId'],
    ['review_dispute', 'reviewDisputeId'],
  ] as const)('rejects absent source identity for %s before writing', async (sourceType, field) => {
    for (const id of [undefined, null]) {
      const input = {
        trainingEvidence: 'staff_or_user',
        sourceType,
        eventType: 'report_resolved',
        label: 'accepted',
        humanAction: 'report_reviewed',
        [field]: id,
      } as unknown as RecordModerationTrainingFeedbackInput
      await expect(recordModerationTrainingFeedback(input)).rejects.toMatchObject({
        status: 422,
        message: `${field} is required`,
      })
      expect(
        await recordModerationTrainingFeedback({ ...input, trainingEvidence: 'agent' }),
      ).toBeNull()
    }
  })

  it('records report feedback for a non-post target with its source identity', async () => {
    const actor = await createTestUser()
    const target = await createTestUser()
    const moderationReportId = await insertTestModerationReport({
      reporterUserId: actor.id,
      entityType: 'user',
      entityId: target.id,
    })
    const feedback = await recordModerationTrainingFeedback({
      trainingEvidence: 'staff_or_user',
      sourceType: 'moderation_report',
      moderationReportId,
      actorUserId: actor.id,
      eventType: 'report_resolved',
      label: 'accepted',
      humanAction: 'report_reviewed',
    })
    expect(feedback).toMatchObject({ moderation_report_id: moderationReportId, post_id: null })
  })
})
