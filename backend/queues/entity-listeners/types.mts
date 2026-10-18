export type {
  CreateTopicUpdates,
  EntityReconciliationDispatchData,
  ReconcileEntityData,
} from '@queues/background/enqueues/entity-listeners-payloads'

/** Local job names of the `entity-listeners` domain (the queue-wide name is `entity-listeners.<name>`). */
export type EntityJobs =
  | 'reconcileEntity'
  | 'reconcileEntities'
  | 'processUrlCreated'
  | 'processImageCreated'
  | 'processUserCreated'
  | 'processUserUpdated'
  | 'processUserLoggedIn'
  | 'processAutoFollowReferrer'
  | 'processPostCreated'
  | 'processPostUpdated'
  | 'processPostDeleted'
  | 'processTopicCreated'
  | 'processTopicUpdated'
  | 'processTopicDeleted'
  | 'processConversationMessageCreated'
  | 'processCommunityAgentPromptsDeactivated'
