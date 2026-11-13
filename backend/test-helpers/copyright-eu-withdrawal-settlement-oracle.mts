import { expect } from 'vitest'
import { createRequest } from './api/server.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Existing-case participant visibility and the complete nonbinding settlement protocol survive withdrawal. */
export async function assertEuWithdrawalSettlementContinuity(input: {
  staff: PrivateUser
  notifier: PrivateUser
  restrictedNoticeId: string
}) {
  const staffRequest = createRequest()
  const notifierRequest = createRequest()
  await Promise.all([
    staffRequest.authenticateAs(input.staff),
    notifierRequest.authenticateAs(input.notifier),
  ])
  const detail = await notifierRequest
    .get(`/api/v1/copyright-notices/${input.restrictedNoticeId}/participant`)
    .expect(200)
  expect(detail.body.copyright_notice.eu.outcome).toBe('restrict')

  const base = `/api/v1/copyright-eu-notices/${input.restrictedNoticeId}/dispute-settlements`
  const referredAt = new Date()
  const referral = await staffRequest
    .post(base)
    .send({
      body_name: 'Independent test dispute body',
      referred_at: referredAt.toISOString(),
      referred_by_party: 'notifier',
      referred_by_id: input.notifier.id,
    })
    .expect(201)
  const referralId: string = referral.body.copyright_eu_dispute_settlement_referral.id
  const decidedAt = new Date(referredAt.getTime() + 1_000)
  const outcome = await staffRequest
    .post(`${base}/${referralId}/outcomes`)
    .send({
      result: 'decided_for_recipient',
      decided_at: decidedAt.toISOString(),
    })
    .expect(201)
  expect(outcome.body.copyright_eu_dispute_settlement_outcome.result).toBe('decided_for_recipient')
  const implementedAt = new Date(decidedAt.getTime() + 1_000)
  const implementation = await staffRequest
    .post(`${base}/${referralId}/implementations`)
    .send({
      implemented_at: implementedAt.toISOString(),
    })
    .expect(201)
  expect(implementation.body.copyright_eu_dispute_settlement_implementation.implemented_at).toBe(
    implementedAt.toISOString(),
  )
  return detail.body.copyright_notice.eu.outcome
}
