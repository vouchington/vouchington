import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  markTestPostDeletedBy,
} from '@voucha/test-helpers'
import { getModerationReportDetail } from '../detail.mts'
import { insertReportJudgement } from '../judgements.mts'

describe('getModerationReportDetail', () => {
  it('returns persisted judgement identities and hides a deleted target', async () => {
    const reporter = await createTestUser()
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `report-detail-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Report detail target',
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: 'Reporter note',
    })

    const before = await getModerationReportDetail(reportId)
    expect(before?.report).toEqual(
      expect.objectContaining({
        id: reportId,
        entity_type: 'post',
        entity_id: postId,
        reporter_user_id: reporter.id,
        reason: 'spam',
        note: 'Reporter note',
        status: 'pending',
      }),
    )
    expect(before?.judgement).toBeNull()

    const first = await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'no_action',
      publicResponse: 'Same judgement text',
      internalResponse: 'Same internal text',
      model: 'gpt-5.4-nano',
    })
    expect((await getModerationReportDetail(reportId))?.judgement?.id).toBe(first.id)

    const second = await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      rerunById: reporter.id,
      recommendedAction: 'no_action',
      publicResponse: 'Same judgement text',
      internalResponse: 'Same internal text',
      model: 'gpt-5.4-nano',
    })
    const after = await getModerationReportDetail(reportId)
    expect(second.id).not.toBe(first.id)
    expect(after?.judgement).toEqual({
      id: second.id,
      recommended_action: 'no_action',
      public_response: 'Same judgement text',
      internal_response: 'Same internal text',
    })

    await markTestPostDeletedBy(postId, author.id)
    expect(await getModerationReportDetail(reportId)).toBeNull()
    expect(await getModerationReportDetail(crypto.randomUUID())).toBeNull()
  })
})
