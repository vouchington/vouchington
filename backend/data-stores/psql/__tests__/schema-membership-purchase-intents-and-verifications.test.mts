import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  claimCompletedMembershipVerification,
  completeMembershipVerification,
  completeMembershipVerificationWithoutResult,
  createCrossOwnerMembershipVerification,
  createDuplicateMembershipVerification,
  createExpiredPurchaseIntent,
  createFailedPurchaseIntentWithoutCode,
  createMembershipAuditUser,
  createMembershipProviderEvidence,
  createMembershipPurchaseIntent,
  createMembershipPurchaseIntentFixture,
  createMembershipVerification,
  createPartialPriceProviderProduct,
  createPartialPurchaseIntentCheckout,
  createPriceOptionalProviderProduct,
  deleteMembershipAuditUser,
  getMembershipAuditOwnership,
  setUnstableMembershipVerificationResult,
} from '../../../test-helpers/data-stores/psql/membership-purchase-intents.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership purchase intent and verification schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('allows provider mappings without a price but rejects partial money values', async () => {
    const suffix = randomUUID()
    await expect(createPriceOptionalProviderProduct(suffix)).resolves.toMatchObject({ rowCount: 1 })
    await expect(createPartialPriceProviderProduct(suffix)).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces owner-scoped idempotency and launch lifecycle constraints', async () => {
    const fixture = await createMembershipPurchaseIntentFixture('intent')
    const idempotencyKey = randomUUID()
    await expect(createMembershipPurchaseIntent(fixture, idempotencyKey)).resolves.toEqual(
      expect.any(String),
    )
    await expect(createMembershipPurchaseIntent(fixture, idempotencyKey)).rejects.toMatchObject({
      code: '23505',
    })
    await expect(createPartialPurchaseIntentCheckout(fixture)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(createFailedPurchaseIntentWithoutCode(fixture)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(createExpiredPurchaseIntent(fixture)).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces verification ownership, provider context, and timestamp-derived results', async () => {
    const fixture = await createMembershipPurchaseIntentFixture('verification')
    const intentId = await createMembershipPurchaseIntent(fixture, randomUUID())
    const evidenceId = await createMembershipProviderEvidence(fixture)
    const idempotencyKey = randomUUID()
    const verificationId = await createMembershipVerification(
      fixture,
      intentId,
      evidenceId,
      idempotencyKey,
    )

    await expect(
      createDuplicateMembershipVerification(fixture, evidenceId, idempotencyKey),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(completeMembershipVerificationWithoutResult(verificationId)).rejects.toMatchObject(
      { code: '23514' },
    )
    await expect(completeMembershipVerification(verificationId)).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(setUnstableMembershipVerificationResult(verificationId)).rejects.toMatchObject({
      code: '22P02',
    })
    await expect(claimCompletedMembershipVerification(verificationId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      createCrossOwnerMembershipVerification(fixture, intentId, evidenceId),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('retains purchase and verification audit rows after an account is hard-deleted', async () => {
    const userId = await createMembershipAuditUser()
    const fixture = await createMembershipPurchaseIntentFixture('hard-delete', userId)
    const intentId = await createMembershipPurchaseIntent(fixture, randomUUID())
    const evidenceId = await createMembershipProviderEvidence(fixture)
    const verificationId = await createMembershipVerification(
      fixture,
      intentId,
      evidenceId,
      randomUUID(),
    )

    await expect(deleteMembershipAuditUser(userId)).resolves.toMatchObject({ rowCount: 1 })
    expect(await getMembershipAuditOwnership(intentId, verificationId)).toEqual({
      intent_user_id: null,
      verification_user_id: null,
    })
  })
})
