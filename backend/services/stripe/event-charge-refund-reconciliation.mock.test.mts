import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimAdministratorRefundRequest,
  getMembershipRefunds,
  leaseDueRefundReconciliation,
  recordRefundReconciliationAttempt,
  scheduleRefundReconciliationRetry,
} from '@services/memberships'
import { createTestMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { getMatchedChargeRefundedReceiptForTest } from '../../test-helpers/entities/membership-refund-event-state.mts'
import { cleanupRefundReconciliationOperationsForTest } from '../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import { readAllQueueJobs } from '../../test-helpers/queue-jobs.mts'
import { memberships } from '@queues/memberships/queues'
import type { PrivateUser } from '@services/users/types'

vi.mock<typeof import('@modules/stripe')>(import('@modules/stripe'), async importOriginal => ({
  ...(await importOriginal()),
  getStripeInvoice: vi.fn<VitestLooseMock>(),
  listStripeRefundsForCharge: vi.fn<VitestLooseMock>(),
}))

import { getStripeInvoice } from '@modules/stripe'
import { handleChargeRefunded } from './event-charge-handlers.mts'

const mockGetStripeInvoice = vi.mocked(getStripeInvoice)
const applicationContext = { applicationId: `stripe-charge-refund-${randomUUID()}` }

describe('charge.refunded reconciliation receipt', () => {
  let membershipId: string
  let user: PrivateUser
  const subscriptionId = `sub_wch_${randomUUID()}`

  beforeAll(async () => {
    user = await createTestUser()
    const sku = await createTestSku({
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'test',
    })
    membershipId = (
      await createTestMembership({
        user_id: user.id,
        sku_id: sku.id,
        stripe_subscription_id: subscriptionId,
        provider_application_id: applicationContext.applicationId,
        provider_environment: 'test',
      })
    ).id
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStripeInvoice.mockResolvedValue({
      parent: { subscription_details: { subscription: subscriptionId } },
    } as never)
  })

  it('records invalid-metadata receipts without enriching or waking an operation', async () => {
    const refundId = `re_wch_invalid_metadata_${randomUUID()}`
    await handle(`evt_invalid_metadata_${randomUUID()}`, {
      id: `ch_wch_invalid_metadata_${randomUUID()}`,
      invoice: 'in_1',
      created: 1_700_000_000,
      refunds: {
        data: [
          {
            id: refundId,
            amount: 1000,
            currency: 'usd',
            metadata: {
              membership_refund_operation_id: 'not-a-uuid',
              membership_refund_attempt_id: randomUUID(),
            },
          },
        ],
        has_more: false,
      },
    })

    expect(
      (await getMembershipRefunds(user.id)).find(refund => refund.stripe_refund_id === refundId),
    ).toMatchObject({ source: 'stripe_dashboard', revoked_access: false })
  })

  it('enriches and wakes only the matching durable administrator attempt after receipt persistence', async () => {
    const administrator = await createTestUser({ administrator: true })
    const chargeId = `ch_wch_matched_${randomUUID()}`
    const operation = await claimAdministratorRefundRequest({
      amount: { amount: 1000, currency: 'usd' },
      cancelRequested: false,
      idempotencyKey: randomUUID(),
      issuedById: administrator.id,
      membershipId,
      note: null,
      periodEndsAt: null,
      periodStartedAt: null,
      providerPaymentReference: chargeId,
      providerSubscriptionReference: null,
      reason: 'other',
      requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
    })
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected administrator refund reconciliation lease')
    const attempt = await recordRefundReconciliationAttempt(lease, `provider-key-${randomUUID()}`)
    await scheduleRefundReconciliationRetry(lease, new Date(Date.now() - 1), 'await receipt')
    const refundId = `re_wch_matched_${randomUUID()}`

    try {
      await handle(`evt_matched_${randomUUID()}`, {
        id: chargeId,
        invoice: 'in_1',
        created: 1_700_000_000,
        refunds: {
          data: [
            {
              id: refundId,
              amount: 1000,
              currency: 'usd',
              metadata: {
                membership_refund_operation_id: operation.id,
                membership_refund_attempt_id: attempt.id,
              },
            },
          ],
          has_more: false,
        },
      })

      await expect
        .poll(
          async () => {
            const jobs = await readAllQueueJobs(memberships)
            const reconciliationJob = jobs.find(
              job =>
                job.name === 'reconcileMembershipRefundOperation' &&
                typeof job.data === 'object' &&
                job.data !== null &&
                (job.data as { operationId?: unknown }).operationId === operation.id,
            )
            if (!reconciliationJob) return null
            return getMatchedChargeRefundedReceiptForTest({
              applicationId: applicationContext.applicationId,
              attemptId: attempt.id,
              refundId,
            })
          },
          { timeout: 5_000 },
        )
        .toEqual({
          applicationId: applicationContext.applicationId,
          contextMatches: true,
          due: true,
          environment: 'test',
          providerRefundId: refundId,
          receiptCount: '1',
        })
    } finally {
      await cleanupRefundReconciliationOperationsForTest([operation.id])
      await memberships.obliterate({ force: true })
    }
  })
})

async function handle(eventId: string, eventData: Record<string, unknown>) {
  return handleChargeRefunded(eventId, eventData, 'test', applicationContext)
}
