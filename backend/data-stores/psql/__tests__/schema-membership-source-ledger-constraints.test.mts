import { afterAll, describe, expect, it } from 'vitest'
import {
  createMembershipSourceLedgerConstraintFixture,
  createUnverifiedMembershipObservationFixture,
} from '../../../test-helpers/data-stores/psql/membership-source-ledger-constraints.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership source-ledger schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects cross-source state, provider grant observations, and mismatched grant users', async () => {
    const fixture = await createMembershipSourceLedgerConstraintFixture()
    await expect(fixture.rejectCrossSourceState()).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.rejectCrossLineageObservationEvidence()).rejects.toMatchObject({
      code: '23503',
    })
    await expect(fixture.rejectAdminGrantProviderObservation()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectCrossContextRenewalTarget()).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.rejectFamilyRenewalTarget()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectObservationUpdate()).rejects.toThrow(
      'membership provider observations are immutable',
    )
    await expect(fixture.rejectObservationDeletion()).rejects.toThrow(
      'membership provider observations are immutable',
    )
    await expect(fixture.rejectMismatchedGrantUser()).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.rejectMismatchedGrantActivationUser()).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('rejects observations derived from pending or rejected evidence', async () => {
    const fixture = await createUnverifiedMembershipObservationFixture()
    for (const providerRevision of [0, 1]) {
      await expect(fixture.rejectObservation(providerRevision)).rejects.toMatchObject({
        code: '23514',
      })
    }
  })
})
