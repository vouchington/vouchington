import { describe, expect, it } from 'vitest'
import { receiveEuCopyrightNotice } from '@services/copyright-notices'
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
    notifier_name: `Notifier ${suffix}`,
    notifier_email: `notifier-${suffix}@example.test`,
    good_faith_statement: true,
  }
}

function noticeRequest(body: ReturnType<typeof noticeBody>) {
  return {
    contact: body.contact,
    contentDescription: body.content_description,
    grounds: body.grounds,
    hostedUseUrl: body.hosted_use_url,
    notifierName: body.notifier_name,
    notifierEmail: body.notifier_email,
    goodFaithStatement: true as const,
  }
}

describe('EU copyright notice routes', () => {
  useCopyrightIntakeEnvironment()

  it('records acknowledgment failure, redress reuse, and the remaining EU handlers', async () => {
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
        jurisdiction: 'eu_dsa',
        policy_version: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    const claimantRequest = createRequest()
    await claimantRequest.authenticateAs(claimant)
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const pending = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      noticeRequest(noticeBody()),
    )
    const failure = await staffRequest
      .post(`/api/v1/copyright-eu-notices/${pending.notice_id}/acknowledgment-failures`)
      .expect(200)
    expect(failure.body.acknowledgment).toMatchObject({
      attempt_count: 1,
      acknowledged_at: null,
      escalated: false,
    })
    await staffRequest
      .post(`/api/v1/copyright-eu-notices/${crypto.randomUUID()}/statements-of-reasons`)
      .send({ statement: 1 })
      .expect(422)
    await staffRequest
      .post(
        `/api/v1/copyright-eu-notices/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`,
      )
      .send({ rationale: 'Missing disposition' })
      .expect(422)
    const periodStart = new Date(Date.now() - 60_000).toISOString()
    await staffRequest.post('/api/v1/copyright-eu-reports').send({ period_start: 1 }).expect(422)
    await staffRequest
      .post('/api/v1/copyright-eu-reports')
      .send({ period_start: periodStart, period_end: 1 })
      .expect(422)
    const created = await claimantRequest
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(noticeBody())
      .expect(201)
    const noticeId = created.body.copyright_eu_notice.notice_id as string
    const statement = await staffRequest
      .post(`/api/v1/copyright-eu-notices/${noticeId}/statements-of-reasons`)
      .send({
        statement: 'Staff statement of reasons',
        public_explanation: 'The notice did not establish infringement.',
        outcome: 'no_action',
      })
      .expect(201)
    expect(statement.body.copyright_eu_statement_of_reasons.automation_disclosure).toBe('human')
    const redressKey = crypto.randomUUID()
    const redress = await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${noticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Please review the restriction' })
      .expect(201)
    expect(redress.body.copyright_eu_redress_request.is_duplicate).toBe(false)
    const replay = await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${noticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Please review the restriction' })
      .expect(200)
    expect(replay.body.copyright_eu_redress_request).toMatchObject({
      id: redress.body.copyright_eu_redress_request.id,
      is_duplicate: true,
    })
    const other = await claimantRequest
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(noticeBody())
      .expect(201)
    const otherNoticeId = other.body.copyright_eu_notice.notice_id as string
    await staffRequest
      .post(`/api/v1/copyright-eu-notices/${otherNoticeId}/statements-of-reasons`)
      .send({
        statement: 'Second staff statement',
        public_explanation: 'The notice did not establish infringement.',
        outcome: 'no_action',
      })
      .expect(201)
    await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${otherNoticeId}/redress-requests`)
      .set('Idempotency-Key', redressKey)
      .send({ explanation: 'Reuse the first key' })
      .expect(409)
    const decision = await staffRequest
      .post(
        `/api/v1/copyright-eu-notices/${noticeId}/redress-requests/${redress.body.copyright_eu_redress_request.id}/decisions`,
      )
      .send({ staff_disposition: 'revoke', rationale: 'Staff redress rationale' })
      .expect(201)
    expect(decision.body.copyright_eu_redress_decision.staff_disposition).toBe('revoke')
    const complaint = await claimantRequest
      .post(`/api/v1/copyright-eu-notices/${noticeId}/supervised-complaints`)
      .send({
        authority_reference: `dsc-${crypto.randomUUID()}`,
        explanation: 'Complaint filed with the authority',
      })
      .expect(201)
    expect(complaint.body.copyright_eu_supervised_complaint.escalation_id).toEqual(
      expect.any(String),
    )
    const report = await staffRequest
      .post('/api/v1/copyright-eu-reports')
      .send({
        period_start: periodStart,
        period_end: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(201)
    expect(report.body.copyright_eu_report).toMatchObject({
      id: expect.any(String),
      receipt_count: expect.any(Number),
    })
  })
})
