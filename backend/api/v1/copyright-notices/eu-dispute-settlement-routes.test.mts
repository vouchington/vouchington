import { describe, expect, it } from 'vitest'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedDeterminedTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

const base = '/api/v1/copyright-eu-notices'
const schemaDiagnostic = /schema|must be|required|invalid/i

function referralBody(userId: string) {
  return {
    body_name: 'Independent Dispute Body',
    referred_at: new Date().toISOString(),
    referred_by_party: 'notifier',
    referred_by_id: userId,
  }
}

describe('EU dispute settlement staff request contracts', () => {
  useCopyrightIntakeEnvironment()

  it.each([
    'dispute-settlements',
    'dispute-settlements/:referralId/outcomes',
    'dispute-settlements/:referralId/implementations',
  ])('keeps 401/403 ahead of schema diagnostics for %s', async suffix => {
    const { anonymousRequest, strangerRequest } = await createTerritorialActors()
    const url = `${base}/not-a-uuid/${suffix.replace(':referralId', 'not-a-uuid')}`
    const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
    expect(anonymous.text).not.toMatch(schemaDiagnostic)
    await strangerRequest.post(url).send({ injected: true }).expect(403)
  })

  it('rejects malformed paths and closed referral fields before recording a valid referral', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, 'eu_dsa')
    const noticeId = await seedDeterminedTerritorialNotice('eu_dsa', actors)
    const url = `${base}/${noticeId}/dispute-settlements`
    const body = referralBody(actors.claimant.id)
    await actors.staffRequest.post(`${base}/not-a-uuid/dispute-settlements`).send(body).expect(422)
    for (const malformed of [
      { ...body, injected: true },
      { ...body, body_name: undefined },
      { ...body, referred_by_party: 'reviewer' },
      { ...body, referred_at: 'not-a-date' },
      { ...body, referred_by_id: 'not-a-uuid' },
    ]) {
      await actors.staffRequest.post(url).send(malformed).expect(422)
    }
    const created = await actors.staffRequest.post(url).send(body).expect(201)
    expect(created.body.copyright_eu_dispute_settlement_referral.id).toEqual(expect.any(String))
  })

  it('closes outcome and implementation contracts and keeps the one-outcome invariant', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, 'eu_dsa')
    const noticeId = await seedDeterminedTerritorialNotice('eu_dsa', actors)
    const referralUrl = `${base}/${noticeId}/dispute-settlements`
    const referredAt = new Date()
    const referral = await actors.staffRequest
      .post(referralUrl)
      .send({
        ...referralBody(actors.claimant.id),
        referred_at: referredAt.toISOString(),
      })
      .expect(201)
    const referralId = referral.body.copyright_eu_dispute_settlement_referral.id as string
    const outcomeUrl = `${referralUrl}/${referralId}/outcomes`
    const implementationUrl = `${referralUrl}/${referralId}/implementations`
    const decidedAt = new Date(referredAt.getTime() + 1_000)
    const outcomeBody = { result: 'decided_for_recipient', decided_at: decidedAt.toISOString() }
    await actors.staffRequest
      .post(`${referralUrl}/not-a-uuid/outcomes`)
      .send(outcomeBody)
      .expect(422)
    await actors.staffRequest
      .post(outcomeUrl)
      .send({ ...outcomeBody, injected: true })
      .expect(422)
    await actors.staffRequest
      .post(outcomeUrl)
      .send({ result: 'unknown', decided_at: decidedAt.toISOString() })
      .expect(422)
    await actors.staffRequest
      .post(outcomeUrl)
      .send({ ...outcomeBody, decided_at: 'not-a-date' })
      .expect(422)
    const outcome = await actors.staffRequest.post(outcomeUrl).send(outcomeBody).expect(201)
    expect(outcome.body.copyright_eu_dispute_settlement_outcome.result).toBe(
      'decided_for_recipient',
    )
    await actors.staffRequest.post(outcomeUrl).send(outcomeBody).expect(409)
    const body = { implemented_at: new Date(decidedAt.getTime() + 1_000).toISOString() }
    await actors.staffRequest
      .post(`${referralUrl}/not-a-uuid/implementations`)
      .send(body)
      .expect(422)
    await actors.staffRequest
      .post(implementationUrl)
      .send({ ...body, injected: true })
      .expect(422)
    await actors.staffRequest
      .post(implementationUrl)
      .send({ implemented_at: 'not-a-date' })
      .expect(422)
    const implemented = await actors.staffRequest.post(implementationUrl).send(body).expect(201)
    expect(implemented.body.copyright_eu_dispute_settlement_implementation.implemented_at).toBe(
      body.implemented_at,
    )
  })
})
