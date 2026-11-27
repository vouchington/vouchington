import { MEMBERSHIP_EXPIRY_SCENARIO_IDS } from './membership-expiry-scenario-ids.mts'

export const MEMBERSHIP_SCENARIO_IDS = [
  'membership-refunds-already-refunded-batch',
  'membership-change-batch-insert',
  'membership-change-batch-effects',
  'membership-change-batch-latest',
  'membership-direct-replacement-heavy-owner',
  'membership-refund-target-heavy-current',
  'membership-refund-target-heavy-history',
  ...MEMBERSHIP_EXPIRY_SCENARIO_IDS,
  'membership-outstanding-grants-at-cap',
  'membership-active-catalog-near-cap',
  'membership-pending-state-at-default',
  'membership-entitlement-effect-claim-at-default',
  'membership-entitlement-effect-complete-at-default',
  'membership-refund-reconciliation-dispatch-at-default',
] as const
