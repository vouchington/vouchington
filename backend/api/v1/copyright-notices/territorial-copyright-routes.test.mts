import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
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

describe('territorial copyright notice routes', () => {
  useCopyrightIntakeEnvironment()

  it('lets an administrator approve policy and a claimant record an EU notice', async () => {
    const [claimant, moderator, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const body = noticeBody()
    const claimantRequest = createRequest()
    await claimantRequest.authenticateAs(claimant)
    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(moderator)
    await moderatorRequest
      .post('/api/v1/copyright-jurisdiction-policies')
      .send({ jurisdiction: 'eu_dsa', policy_version: 'eu-route' })
      .expect(403)
    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    const approval = await administratorRequest
      .post('/api/v1/copyright-jurisdiction-policies')
      .send({
        jurisdiction: 'eu_dsa',
        policy_version: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    expect(approval.body.copyright_jurisdiction_policy.jurisdiction).toBe('eu_dsa')
    const key = crypto.randomUUID()
    const created = await claimantRequest
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body.copyright_eu_notice.route_destination).toBe('staff_queue')
    expect(created.body.acknowledgment.acknowledged_at).toEqual(expect.any(String))
    const replay = await claimantRequest
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200)
    expect(replay.body.copyright_eu_notice.is_duplicate).toBe(true)
  })
})
