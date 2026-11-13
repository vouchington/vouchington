import { assertUkRouteReview } from '@voucha/test-helpers/copyright-uk-route-review-outcome'
import { assertUkRouteIntake } from '@voucha/test-helpers/copyright-uk-route-intake-outcome'
import {
  assertUkRouteAcknowledgmentFailure,
  assertUkRouteRedress,
  assertUkRouteRedressReplay,
} from '@voucha/test-helpers/copyright-uk-route-request-outcomes'
import { assertUkRouteRedressDecision } from '@voucha/test-helpers/copyright-uk-route-decision-outcome'
import {
  createUkRouteAcknowledgedCase,
  createUkRouteDecidedCase,
  createUkRouteRedressCase,
} from '@voucha/test-helpers/copyright-uk-route-fixtures'
import { describe, it } from 'vitest'
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
    await assertUkRouteAcknowledgmentFailure(staffRequest, pending.notice_id)
    const body = noticeBody()
    const key = crypto.randomUUID()
    await assertUkRouteIntake({
      request: claimantRequest,
      claimantId: claimant.id,
      key,
      body,
      duplicate: false,
    })
    await assertUkRouteIntake({
      request: claimantRequest,
      claimantId: claimant.id,
      key,
      body,
      duplicate: true,
    })
    const reviewNoticeId = await createUkRouteAcknowledgedCase(claimant)
    await assertUkRouteReview({
      noticeId: reviewNoticeId,
      claimant,
      staff,
      claimantContact: body.contact,
      request: staffRequest,
    })
    const redressNoticeId = await createUkRouteDecidedCase(claimant, staff)
    const redressKey = crypto.randomUUID()
    const member = await createTestUser()
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    for (const request of [claimantRequest, memberRequest])
      await request
        .post(`/api/v1/copyright-uk-notices/${redressNoticeId}/redress-requests`)
        .set('Idempotency-Key', redressKey)
        .send({ explanation: 'Please review this notice' })
        .expect(403)
    await assertUkRouteRedress({
      request: staffRequest,
      noticeId: redressNoticeId,
      staffId: staff.id,
      key: redressKey,
    })
    const continuation = await createUkRouteRedressCase(claimant, staff)
    await assertUkRouteRedressReplay({ request: staffRequest, ...continuation })
    const otherNoticeId = await createUkRouteDecidedCase(claimant, staff)
    await assertUkRouteRedressReplay({
      request: staffRequest,
      noticeId: otherNoticeId,
      key: continuation.key,
      redressId: continuation.redressId,
      crossNotice: true,
    })
    await assertUkRouteRedressDecision({
      request: staffRequest,
      noticeId: continuation.noticeId,
      redressId: continuation.redressId,
      staffId: staff.id,
    })
  })
})
