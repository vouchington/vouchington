import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
  markTestPostDeletedBy,
} from '@voucha/test-helpers'

describe('GET /api/v1/reports/:id', () => {
  it('gives moderators and admins the saved identity, including identical-text replacements', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const admin = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `report-detail-${crypto.randomUUID()}`,
      title: 'Reported post',
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await createRequest().get(`/api/v1/reports/${reportId}`).expect(401)
    for (const member of [author, reporter, await createTestUser()]) {
      const request = createRequest()
      await request.authenticateAs(member)
      await request.get(`/api/v1/reports/${reportId}`).expect(403)
    }
    const request = createRequest()
    await request.authenticateAs(moderator)
    const pending = await request.get(`/api/v1/reports/${reportId}`).expect(200)
    expect(pending.body).toMatchObject({ report: { id: reportId }, judgement: null })
    const first = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'no_action',
      publicResponse: 'Same text',
      internalResponse: 'Same text',
    })
    const saved = await request.get(`/api/v1/reports/${reportId}`).expect(200)
    expect(saved.body.judgement).toEqual({
      id: first,
      recommended_action: 'no_action',
      public_response: 'Same text',
      internal_response: 'Same text',
    })
    const second = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'no_action',
      publicResponse: 'Same text',
      internalResponse: 'Same text',
    })
    expect(second).not.toBe(first)
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    expect(
      (await adminRequest.get(`/api/v1/reports/${reportId}`).expect(200)).body.judgement.id,
    ).toBe(second)
    await request.get(`/api/v1/reports/${crypto.randomUUID()}`).expect(404)
    await request.get('/api/v1/reports/invalid').expect(422)
    await markTestPostDeletedBy(postId, author.id)
    await request.get(`/api/v1/reports/${reportId}`).expect(404)
  })
})
