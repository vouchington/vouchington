/**
 * Copyright delivery is deliberately split by concern. Consumers keep this stable façade while
 * intent leasing/replay and placement delivery evolve independently.
 */
export {
  replayCopyrightRestoreActionsForRestrictions,
  replayFailedCopyrightActionIntent,
  searchRecoverableCopyrightActionIntentIds,
} from './action-delivery-state.mts'

export { processCopyrightActionIntent } from './action-delivery-process.mts'
