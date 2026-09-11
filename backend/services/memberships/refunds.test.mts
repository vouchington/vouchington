import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  deleteTestMembershipAndCountRefundLedgerRows,
} from '@voucha/test-helpers'
import {
  recordAdminMembershipRefund,
  recordMembershipRefundWebhook,
  getMembershipRefunds,
  MembershipRefundRequestConflictError,
} from './refunds.mts'
import { claimMembershipRefundIntent } from './refund-intents.mts'
import { getMembershipSourceIdByMembershipId } from './get.mts'

async function createAdminRefundFixture() {
  const user = await createTestUser()
  const membership = await createTestMembership({ user_id: user.id })
  const stripeRefundId = `re_admin_${Math.random().toString(36).slice(2, 10)}`
  const stripeIdempotencyKey = `voucha-test-${stripeRefundId}`
  const adminRequestFingerprint = 'b'.repeat(64)
  await claimMembershipRefundIntent({
    membershipId: membership.id,
    membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
    issuedById: user.id,
    stripeIdempotencyKey,
    requestFingerprint: adminRequestFingerprint,
  })
  return {
    membership,
    options: {
      membershipId: membership.id,
      userId: user.id,
      stripeRefundId,
      stripeChargeId: 'ch_admin',
      stripePaymentIntentId: null,
      stripeIdempotencyKey,
      adminRequestFingerprint,
      amount: { amount: 500, currency: 'usd' as const },
      reason: 'goodwill' as const,
      revokedAccess: false,
      issuedById: user.id,
      stripeEventId: null,
      note: 'admin note',
    },
  }
}

async function createWebhookClaimFixture(
  webhookPaymentIntentId: string | null,
  adminPaymentIntentId: string | null,
) {
  const user = await createTestUser()
  const membership = await createTestMembership({ user_id: user.id })
  const uniqueId = Math.random().toString(36).slice(2, 10)
  const stripeRefundId = `re_webhook_claim_${uniqueId}`
  const stripeIdempotencyKey = `voucha-webhook-claim-${uniqueId}`
  const requestFingerprint = 'c'.repeat(64)
  await recordMembershipRefundWebhook({
    membershipId: membership.id,
    membershipSourceId: membership.membership_source_id,
    userId: user.id,
    stripeRefundId,
    stripeChargeId: `ch_webhook_claim_${uniqueId}`,
    stripePaymentIntentId: webhookPaymentIntentId,
    amount: { amount: 500, currency: 'usd' },
    stripeEventId: `evt_webhook_claim_${uniqueId}`,
  })
  await claimMembershipRefundIntent({
    membershipId: membership.id,
    membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
    issuedById: user.id,
    stripeIdempotencyKey,
    requestFingerprint,
  })
  return {
    membership,
    options: {
      membershipId: membership.id,
      userId: user.id,
      stripeRefundId,
      stripeChargeId: `ch_webhook_claim_${uniqueId}`,
      stripePaymentIntentId: adminPaymentIntentId,
      stripeIdempotencyKey,
      adminRequestFingerprint: requestFingerprint,
      amount: { amount: 500, currency: 'usd' as const },
      reason: 'goodwill' as const,
      revokedAccess: false,
      issuedById: user.id,
      stripeEventId: null,
      note: null,
    },
  }
}

describe('membership refunds DB operations', () => {
  it('returns the existing receipt for an exact admin replay', async () => {
    const fixture = await createAdminRefundFixture()
    try {
      const inserted = await recordAdminMembershipRefund(fixture.options)
      const replayed = await recordAdminMembershipRefund(fixture.options)
      expect(replayed).toEqual(inserted)
    } finally {
      await deleteTestMembershipAndCountRefundLedgerRows(fixture.membership.id)
    }
  })

  it('rejects a reused Stripe refund ID with mismatched immutable fields', async () => {
    const fixture = await createAdminRefundFixture()
    try {
      await recordAdminMembershipRefund(fixture.options)
      await expect(
        recordAdminMembershipRefund({
          ...fixture.options,
          amount: { amount: 501, currency: 'usd' },
        }),
      ).rejects.toBeInstanceOf(MembershipRefundRequestConflictError)
    } finally {
      await deleteTestMembershipAndCountRefundLedgerRows(fixture.membership.id)
    }
  })

  describe('recordMembershipRefundWebhook', () => {
    it('is idempotent and does not overwrite admin rows', async () => {
      const user = await createTestUser()
      const membership = await createTestMembership({ user_id: user.id })
      const refundId = `re_${Math.random().toString(36).slice(2, 10)}`
      const shared = {
        membershipId: membership.id,
        membershipSourceId: membership.membership_source_id,
        userId: user.id,
        stripeRefundId: refundId,
        stripeChargeId: 'ch_wh',
        stripePaymentIntentId: null,
        amount: { amount: 500, currency: 'usd' as const },
      }

      const stripeIdempotencyKey = `voucha-test-${refundId}`
      const requestFingerprint = 'a'.repeat(64)
      await claimMembershipRefundIntent({
        membershipId: membership.id,
        membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
        issuedById: user.id,
        stripeIdempotencyKey,
        requestFingerprint,
      })
      await recordAdminMembershipRefund({
        ...shared,
        reason: 'goodwill',
        revokedAccess: false,
        issuedById: user.id,
        stripeEventId: null,
        stripeIdempotencyKey,
        adminRequestFingerprint: requestFingerprint,
        note: 'admin note',
      })
      await recordMembershipRefundWebhook({
        ...shared,
        stripeEventId: `evt_${Math.random().toString(36).slice(2)}`,
      })
      await recordMembershipRefundWebhook({
        ...shared,
        stripeEventId: `evt_${Math.random().toString(36).slice(2)}`,
      })

      const matching = (await getMembershipRefunds(user.id)).filter(
        r => r.stripe_refund_id === refundId,
      )
      expect(matching).toHaveLength(1)
      expect(matching[0]!.source).toBe('admin')
      expect(matching[0]!.note).toBe('admin note')

      expect(await deleteTestMembershipAndCountRefundLedgerRows(membership.id)).toEqual({
        intentCount: 1,
        refundCount: 1,
      })
    })

    it('enriches a webhook receipt with the synchronous payment intent', async () => {
      const fixture = await createWebhookClaimFixture(null, 'pi_synchronous')
      try {
        const claimed = await recordAdminMembershipRefund(fixture.options)
        expect(claimed.stripe_payment_intent_id).toBe('pi_synchronous')
        expect(claimed.source).toBe('admin')
      } finally {
        await deleteTestMembershipAndCountRefundLedgerRows(fixture.membership.id)
      }
    })

    it('claims a webhook receipt when both writers know the same payment intent', async () => {
      const fixture = await createWebhookClaimFixture('pi_shared', 'pi_shared')
      try {
        const claimed = await recordAdminMembershipRefund(fixture.options)
        expect(claimed.stripe_payment_intent_id).toBe('pi_shared')
        expect(claimed.source).toBe('admin')
      } finally {
        await deleteTestMembershipAndCountRefundLedgerRows(fixture.membership.id)
      }
    })

    it('rejects a webhook receipt with a conflicting known payment intent', async () => {
      const fixture = await createWebhookClaimFixture('pi_webhook', 'pi_synchronous')
      try {
        await expect(recordAdminMembershipRefund(fixture.options)).rejects.toBeInstanceOf(
          MembershipRefundRequestConflictError,
        )
      } finally {
        await deleteTestMembershipAndCountRefundLedgerRows(fixture.membership.id)
      }
    })
  })

  describe('getMembershipRefunds', () => {
    it('preserves an unknown lowercase Stripe currency when reading a webhook refund', async () => {
      const user = await createTestUser()
      const membership = await createTestMembership({ user_id: user.id })
      const uniqueId = Math.random().toString(36).slice(2, 10)
      const stripeRefundId = `re_unknown_currency_${uniqueId}`
      try {
        await recordMembershipRefundWebhook({
          membershipId: membership.id,
          membershipSourceId: membership.membership_source_id,
          userId: user.id,
          stripeRefundId,
          stripeChargeId: `ch_unknown_currency_${uniqueId}`,
          stripePaymentIntentId: null,
          amount: { amount: 725, currency: 'brl' },
          stripeEventId: `evt_unknown_currency_${uniqueId}`,
        })

        const refund = (await getMembershipRefunds(user.id)).find(
          candidate => candidate.stripe_refund_id === stripeRefundId,
        )
        expect(refund?.amount).toEqual({ amount: 725, currency: 'brl' })
      } finally {
        await deleteTestMembershipAndCountRefundLedgerRows(membership.id)
      }
    })

    it('returns refunds ordered by id DESC', async () => {
      const user = await createTestUser()
      const membership = await createTestMembership({ user_id: user.id })
      const mk = (s: string) =>
        recordMembershipRefundWebhook({
          membershipId: membership.id,
          membershipSourceId: membership.membership_source_id,
          userId: user.id,
          stripeRefundId: `re_o_${s}_${Math.random().toString(36).slice(2, 8)}`,
          stripeChargeId: 'ch_o',
          stripePaymentIntentId: null,
          amount: { amount: 100, currency: 'usd' },
          stripeEventId: `evt_o_${s}_${Math.random().toString(36).slice(2, 8)}`,
        })

      await mk('a')
      await mk('b')

      const refunds = await getMembershipRefunds(user.id)
      expect(refunds.length).toBeGreaterThanOrEqual(2)
      expect(refunds[0]!.id.localeCompare(refunds[1]!.id)).toBeGreaterThan(0)
    })
  })
})
