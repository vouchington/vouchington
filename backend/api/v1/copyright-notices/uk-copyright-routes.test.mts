import { describe, expect, it } from 'vitest'
import { receiveUkCopyrightNotice } from '@services/copyright-notices'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

function noticeBody() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    content_description: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hosted_use_url: `https://example.test/${suffix}`,
  }
}

describe('UK copyright notice routes', () => {
  useCopyrightIntakeEnvironment()

  it('records acknowledgment, review, and staff-recorded redress handlers after policy approval', async () => {
    const [claimant, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    await administratorRequest
      .post('/api/v1/copyright-jurisdiction-policies')
      .send({
        jurisdiction: 'uk',
        policy_version: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    const claimantRequest = createRequest()
    await claimantRequest.authenticateAs(claimant)
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const pending = await receiveUkCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      {
        contact: `pending-${crypto.randomUUID()}@example.test`,
        contentDescription: 'Pending work',
        grounds: 'Pending grounds',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    )
    const failure = await staffRequest
      .post(`/api/v1/copyright-uk-notices/${pending.notice_id}/acknowledgment-failures`)
      .expect(200)
    expect(failure.body.acknowledgment).toMatchObject({
      attempt_count: 1,
      acknowledged_at: null,
      escalated: false,
    })
    const body = noticeBody()
    const key = crypto.randomUUID()
    const created = await claimantRequest
      .post('/api/v1/copyright-uk-notices')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body.copyright_uk_notice.route_destination).toBe('staff_queue')
    expect(created.body.acknowledgment.acknowledged_at).toEqual(expect.any(String))
    const replay = await claimantRequest
      .post('/api/v1/copyright-uk-notices')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200)
    expect(replay.body.copyright_uk_notice.is_duplicate).toBe(true)
    expect(replay.body.acknowledgment.acknowledged_at).toEqual(expect.any(String))
    const noticeId = created.body.copyright_uk_notice.notice_id as string
    const review = await staffRequest
      .post(`/api/v1/copyright-uk-notices/${noticeId}/reviews`)
      .send({
        rationale: 'Staff review rationale',
        public_explanation: 'The notice did not establish infringement.',
        outcome: 'no_action',
      })
      .expect(201)
    expect(review.body.copyright_uk_review.automation_disclosure).toBe('human')
    const redressKey = crypto.randomUUID()
    const member = await createTestUser()
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    for (const request of [claimantRequest, memberRequest])
      await request
        .post(`/api/v1/copyright-uk-notices/${noticeId}/redress-requests`)
        .set('Idempotency-Key', redressKey)
        .send({ explanation: 'Please review this notice' })
        .expect(403)
    const redress = await staffRequest
      .post(`/api/v1/copyright-uk-notices/${noticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Please review this notice' })
      .expect(201)
    expect(redress.body.copyright_uk_redress_request.is_duplicate).toBe(false)
    const redressReplay = await staffRequest
      .post(`/api/v1/copyright-uk-notices/${noticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Please review this notice' })
      .expect(200)
    expect(redressReplay.body.copyright_uk_redress_request).toMatchObject({
      id: redress.body.copyright_uk_redress_request.id,
      is_duplicate: true,
    })
    const other = await claimantRequest
      .post('/api/v1/copyright-uk-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(noticeBody())
      .expect(201)
    const otherNoticeId = other.body.copyright_uk_notice.notice_id as string
    await staffRequest
      .post(`/api/v1/copyright-uk-notices/${otherNoticeId}/reviews`)
      .send({
        rationale: 'Second staff review',
        public_explanation: 'The notice did not establish infringement.',
        outcome: 'no_action',
      })
      .expect(201)
    await staffRequest
      .post(`/api/v1/copyright-uk-notices/${otherNoticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Reuse the first key' })
      .expect(409)
    const decision = await staffRequest
      .post(
        `/api/v1/copyright-uk-notices/${noticeId}/redress-requests/${redress.body.copyright_uk_redress_request.id}/decisions`,
      )
      .send({ staff_disposition: 'maintain', rationale: 'Staff kept the recorded review' })
      .expect(201)
    expect(decision.body.copyright_uk_redress_decision.staff_disposition).toBe('maintain')
  })
})
