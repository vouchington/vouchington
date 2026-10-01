/** Explicit SQL-backed service calls whose shared tests must use an owned bound or keyset. */
export const sharedDbScopeTables = {
  listCopyrightStaffQueue: 'copyright_notices',
  readCopyrightReviewTargetBreaches: 'copyright_notices',
  searchCopyrightStaffEmailIntakes: 'copyright_notice_email_intakes',
  getPendingCopyrightAgentDispatches: 'copyright_notice_dispatch_sources',
  searchDueStatutoryCopyrightRestorationDeadlineIds: 'copyright_notice_deadlines',
  searchRecoverableCopyrightFormReviewIntakeIds: 'copyright_notice_form_intake_reviews',
  searchPendingCopyrightEnforcementAssessmentIds: 'copyright_notice_submission_assessments',
  searchRecoverableCopyrightActionIntentIds: 'copyright_notice_action_intents',
  searchBlockedCopyrightHoldRestorationNoticeIds: 'copyright_notices',
  searchRecoverableCopyrightDeliveryIntentIds: 'copyright_notice_delivery_intents',
  replayFailedMediaDeliveryRegistryRecords: 'media_delivery_registry_records',
  listRecoverableMediaDeliveryRegistryKeys: 'media_delivery_registry_records',
  stageAllCurrentImagePlacementDeliveryRecords: 'media_delivery_registry_records',
  reconcileMediaDeliveryRepairMarkers: 'media_delivery_repair_markers',
  cleanupRetainedMediaBindings: 'retained_image_placement_bindings',
  // Each spans several retained tables; the shared cursor table is what an unscoped call advances.
  cleanupRetainedIdentityRoots: 'retained_identity_cleanup_progress',
  cleanupRetainedRelationIdentities: 'retained_relation_identity_cleanup_progress',
  recoverActivityPubInboxDeliveries: 'ap_inbox_deliveries',
  rearmFailedActivityPubInboxDeliveries: 'ap_inbox_deliveries',
  getRecoverableOAuthAuthorizationIds: 'oauth_authorizations',
  deleteExpiredOAuthAuthorizationBatch: 'oauth_authorizations',
  listAvailableNotificationPushIntents: 'notification_push_intents',
} as const

export type SharedDbScopeOperation = keyof typeof sharedDbScopeTables
export type SharedDbScope =
  | { kind: 'ids'; ids: readonly string[] }
  | { kind: 'cursor'; id: string }
  | { kind: 'global' }
export type SharedDbScopeEvent = {
  operation: SharedDbScopeOperation
  table: (typeof sharedDbScopeTables)[SharedDbScopeOperation]
  scope: SharedDbScope
}
export type SharedDbScopeObserver = (event: SharedDbScopeEvent) => void

const observerKey = Symbol.for('voucha.shared-db-scope-observer')
type ObserverHost = Record<symbol, SharedDbScopeObserver | undefined>

export function observeSharedDbScope(
  operation: SharedDbScopeOperation,
  scope: SharedDbScope,
): void {
  ;(globalThis as unknown as ObserverHost)[observerKey]?.({
    operation,
    table: sharedDbScopeTables[operation],
    scope,
  })
}

export function sharedDbIdsScope(ids?: readonly string[]): SharedDbScope {
  return ids ? { kind: 'ids', ids } : { kind: 'global' }
}

export function sharedDbCursorScope(id?: string | null): SharedDbScope {
  return id ? { kind: 'cursor', id } : { kind: 'global' }
}
