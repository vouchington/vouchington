import { read } from '@data-stores/psql'
import { buildAlreadyRefundedMinorUnitsQuery } from '@services/memberships/refund-stripe-operations'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  SEED_MEMBERSHIP_REFUND_CHARGE_ID,
  SEED_MEMBERSHIP_REFUND_PAYMENT_INTENT_ID,
} from '../seed-data/memberships.mts'

// getAlreadyRefundedMinorUnits batches every pending charge/payment-intent from one
// listRefundableChargesForSubscription call (the admin refund-eligibility check) into a
// single UNNEST-driven query.
export async function runMembershipRefundScenarios() {
  registerScenarioContract('membership-refunds-already-refunded-batch', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_membership_refunds__stripe_charge_id',
          'idx_membership_refunds__stripe_payment_intent_id',
        ],
      },
    ],
  })
  await runAndCapture('membership-refunds-already-refunded-batch', () =>
    read(
      buildAlreadyRefundedMinorUnitsQuery(
        ['charge', 'payment_intent'],
        [SEED_MEMBERSHIP_REFUND_CHARGE_ID, SEED_MEMBERSHIP_REFUND_PAYMENT_INTENT_ID],
      ),
    ),
  )
}
