import { createSharedDbScopeObserver } from '@vouchington/postgres/query-telemetry'

/** Explicit SQL-backed service calls whose shared tests must use an owned bound or keyset. */
const sharedDbScopeTables = {
  listCopyrightStaffQueue: 'copyright_notices',
  readCopyrightReviewTargetBreaches: 'copyright_notices',
  selectCopyrightRetentionErasureCandidates: 'copyright_notices',
  searchCopyrightStaffEmailIntakes: 'copyright_notice_email_intakes',
  promoteCopyrightEmailIntakeGraph: 'copyright_notice_email_message_ancestors',
  promoteCopyrightEmailIntakeGraphLocked: 'copyright_notice_email_intakes',
  associateCopyrightEmailIntakePreflight: 'copyright_notice_email_intakes',
  associateCopyrightEmailIntakeLocked: 'copyright_notice_email_intakes',
  getPendingCopyrightAgentDispatches: 'copyright_notice_dispatch_sources',
  searchDueStatutoryCopyrightRestorationDeadlineIds: 'copyright_notice_deadlines',
  searchRecoverableCopyrightFormReviewIntakeIds: 'copyright_notice_form_intake_reviews',
  searchPendingCopyrightEnforcementAssessmentIds: 'copyright_notice_submission_assessments',
  searchRecoverableCopyrightActionIntentIds: 'copyright_notice_action_work_items',
  searchBlockedCopyrightHoldRestorationNoticeIds: 'copyright_notices',
  searchSuspendedClaimantAutomaticRestrictionNoticeIds: 'copyright_notices',
  searchRecoverableCopyrightDeliveryIntentIds: 'copyright_notice_delivery_work_items',
  searchUnmaterializedDsaStatementRestrictionIds: 'copyright_restrictions',
  searchRecoverableDsaStatementSubmissionIds: 'copyright_dsa_statement_submissions',
  replayFailedMediaDeliveryRegistryRecords: 'media_delivery_registry_records',
  listRecoverableMediaDeliveryRegistryIds: 'media_delivery_registry_records',
  stageAllCurrentImagePlacementDeliveryRecords: 'media_delivery_registry_records',
  reconcileMediaDeliveryRepairMarkers: 'media_delivery_repair_markers',
  cleanupRetainedMediaBindings: 'retained_image_placement_bindings',
  // Each spans several retained tables; the shared cursor table is what an unscoped call advances.
  cleanupRetainedIdentityRoots: 'retained_identity_cleanup_cursors',
  cleanupRetainedRelationIdentities: 'retained_relation_identity_cleanup_cursors',
  recoverActivityPubInboxDeliveries: 'activitypub_inbox_delivery_work_items',
  rearmFailedActivityPubInboxDeliveries: 'activitypub_inbox_delivery_work_items',
  getRecoverableOAuthAuthorizationIds: 'oauth_authorizations',
  deleteExpiredOAuthAuthorizationBatch: 'oauth_authorizations',
  listAvailableNotificationPushIntents: 'notification_push_intents',
} as const

export type SharedDbScopeOperation = keyof typeof sharedDbScopeTables

const scopeObserver = createSharedDbScopeObserver({
  tables: sharedDbScopeTables,
  key: 'voucha.shared-db-scope-observer',
})

export const observeSharedDbScope = scopeObserver.observe
