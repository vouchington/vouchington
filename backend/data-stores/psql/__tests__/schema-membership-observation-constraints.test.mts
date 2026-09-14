import { afterAll, describe, expect, it } from 'vitest'
import {
  createMembershipEvidenceLifecycleFixture,
  createMembershipObservationConstraintFixture,
  createRetiredMembershipProduct,
  mutateMembershipProductInterval,
  mutateMembershipProductPlan,
  updateMembershipProductRetirement,
} from '../../../test-helpers/data-stores/psql/membership-observation-constraints.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership provider observation schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects partial, backwards-effective, and cross-kind observation state', async () => {
    const fixture = await createMembershipObservationConstraintFixture()
    await expect(fixture.allowObservationWithoutKnownPrice()).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(fixture.rejectPartialRenewalSnapshot()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectBackwardsRenewalEffectiveTime()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectFamilyObservationOnDirectState()).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('keeps evidence identity immutable while allowing verified evidence invalidation', async () => {
    const fixture = await createMembershipEvidenceLifecycleFixture()
    await expect(fixture.rejectMutation()).rejects.toThrow(
      'membership provider evidence identity is immutable',
    )
    await expect(fixture.verify()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.invalidateVerifiedEvidence()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.rejectTerminalMutation()).rejects.toThrow(
      'membership provider evidence lifecycle is terminal',
    )
    await expect(fixture.rejectDeletion()).rejects.toThrow(
      'membership provider evidence records are immutable',
    )
    await expect(fixture.rejectReceivedEvidence()).resolves.toMatchObject({ rowCount: 1 })
  })

  it('preserves canonical product identity while allowing retirement updates', async () => {
    const productId = await createRetiredMembershipProduct()
    await expect(updateMembershipProductRetirement(productId)).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(mutateMembershipProductPlan(productId)).rejects.toThrow(
      'membership product identity is immutable',
    )
    await expect(mutateMembershipProductInterval(productId)).rejects.toThrow(
      'membership product identity is immutable',
    )
  })
})
