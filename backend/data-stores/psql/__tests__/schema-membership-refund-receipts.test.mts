import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createCollisionHandlingMembershipOperation,
  createMembershipAutomaticRefundReceipt,
  createMembershipRefundOperation,
  createMismatchedMembershipAutomaticRefundReceipt,
  deleteMembershipAutomaticRefundReceipt,
  mutateMembershipAutomaticRefundReceipt,
} from '../../../test-helpers/data-stores/psql/membership-refund-receipts.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership automatic refund receipts', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('scopes provider identities and rejects receipt mutation', async () => {
    const suffix = randomUUID()
    const first = await createMembershipRefundOperation(
      `receipt-a-${suffix}`,
      `shared-key-${suffix}`,
    )
    const second = await createMembershipRefundOperation(
      `receipt-b-${suffix}`,
      `shared-key-${suffix}`,
    )
    const sameContext = await createMembershipRefundOperation(
      first.applicationId,
      `same-context-${suffix}`,
    )
    const mismatched = await createMembershipRefundOperation(
      `receipt-c-${suffix}`,
      `mismatch-key-${suffix}`,
    )
    const providerRefundId = `refund-${suffix}`
    const firstReceipt = await createMembershipAutomaticRefundReceipt(first, providerRefundId)

    await expect(createMembershipAutomaticRefundReceipt(second, providerRefundId)).resolves.toEqual(
      expect.any(String),
    )
    await expect(
      createMembershipAutomaticRefundReceipt(sameContext, providerRefundId),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      createMembershipRefundOperation(first.applicationId, `shared-key-${suffix}`),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      createMismatchedMembershipAutomaticRefundReceipt(
        mismatched,
        second.applicationId,
        `mismatch-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(mutateMembershipAutomaticRefundReceipt(firstReceipt)).rejects.toThrow(
      'membership automatic refund receipts are immutable',
    )
    await expect(deleteMembershipAutomaticRefundReceipt(firstReceipt)).rejects.toThrow(
      'membership automatic refund receipts are immutable',
    )
  })

  it('records collision time only for collision-handling operations', async () => {
    await expect(
      createMembershipRefundOperation(
        `invalid-automatic-${randomUUID()}`,
        randomUUID(),
        new Date(),
      ),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createCollisionHandlingMembershipOperation('collision_resolution', false),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createCollisionHandlingMembershipOperation('collision_resolution', true),
    ).resolves.toEqual(expect.any(String))
    await expect(
      createCollisionHandlingMembershipOperation('ineligible_purchase_reversal', false),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createCollisionHandlingMembershipOperation('ineligible_purchase_reversal', true),
    ).resolves.toEqual(expect.any(String))
  })
})
