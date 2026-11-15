import { randomUUID } from 'node:crypto'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'

export async function createTestAdministratorRefundRequest(
  options: {
    cancelRequested?: boolean
    idempotencyKey?: string
    providerApplicationId?: string
  } = {},
) {
  const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
  const membership = await createTestMembership({
    user_id: member.id,
    provider_application_id: options.providerApplicationId,
    provider_environment: 'test',
    stripe_subscription_id: `sub-refund-reconciliation-${randomUUID()}`,
  })
  const periodStartedAt = new Date('2026-09-01T00:00:00.000Z')
  return {
    amount: { amount: 700, currency: 'usd' as const },
    cancelRequested: options.cancelRequested ?? true,
    idempotencyKey: options.idempotencyKey ?? `administrator-refund-${randomUUID()}`,
    issuedById: administrator.id,
    membershipId: membership.id,
    note: 'Customer requested a refund',
    periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
    periodStartedAt,
    providerPaymentReference: `payment-${randomUUID()}`,
    providerSubscriptionReference:
      options.cancelRequested === false ? null : `sub-refund-reconciliation-${randomUUID()}`,
    reason: 'requested' as const,
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  }
}
