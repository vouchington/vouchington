import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  expireContributionAdmissionClaimDuringTransactionForTest,
} from '@voucha/test-helpers'
import { claimContributionAdmission } from './admission-reservations.mts'
import { renewContributionAdmissionLease } from './admission-lease-renewal.mts'

describe('contribution admission lease renewal', () => {
  it('renews the commit fence through the transaction-owned query', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const claim = await claimContributionAdmission(
      user.id,
      crypto.randomUUID(),
      { request: crypto.randomUUID() },
      {
        route: 'test.lease-renewal',
        scope: 'test',
        source: 'discussion',
        postType: 'discussion',
        policyRevision: 'test',
      },
    )
    expect(claim.kind).toBe('claimed')
    if (claim.kind !== 'claimed') return

    await using query = await beginTransaction()
    const renewedAt = await renewContributionAdmissionLease(
      query,
      claim.reservationId,
      claim.leaseId,
    )
    await query.commit()
    expect(renewedAt).toBeInstanceOf(Date)
  })

  it('does not renew a lease that expires while its transaction stays open', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const claim = await claimContributionAdmission(
      user.id,
      crypto.randomUUID(),
      { request: crypto.randomUUID() },
      {
        route: 'test.lease-renewal',
        scope: 'test',
        source: 'discussion',
        postType: 'discussion',
        policyRevision: 'test',
      },
    )
    expect(claim.kind).toBe('claimed')
    if (claim.kind !== 'claimed') return

    await expect(
      renewExpiredContributionAdmissionLease(claim.reservationId, claim.leaseId),
    ).resolves.toBeNull()
  })
})

async function renewExpiredContributionAdmissionLease(
  reservationId: string,
  leaseId: string,
): Promise<Date | null> {
  await using query = await beginTransaction()
  await expireContributionAdmissionClaimDuringTransactionForTest(query, reservationId)
  const result = renewContributionAdmissionLease(query, reservationId, leaseId)

  await query.commit()
  return result
}
