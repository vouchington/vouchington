/**
 * Copyright delivery is deliberately split by concern. Consumers keep this stable façade while
 * intent leasing/replay and placement delivery evolve independently.
 */
export {
  claimCopyrightActionIntent,
  completeCopyrightActionIntent,
  failCopyrightActionIntent,
  listRecoverableCopyrightActionIntentIds,
  processCopyrightActionIntent,
  replayCopyrightRestoreActionsForRestrictions,
  replayFailedCopyrightActionIntent,
} from './action-delivery-process.mts'

export type {
  CopyrightActionDeliveryOutcome,
  CopyrightClaimedActionIntent,
} from './action-delivery-process.mts'
