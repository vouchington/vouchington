import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import type {
  CreateTopicUpdates,
  EntityReconciliationDispatchData,
  ProcessPostCreatedJobData,
  ReconcileEntityData,
} from './entity-listeners-payloads.mts'

// The old queue had no ordering key or limiter; its cap was the worker concurrency of 5. One
// domain-wide group of 5 keeps that cap on the shared worker. Reconciliation pages itself (the
// sweep saves a cursor and moves itself to delayed), so no job here fans out unbounded.
export const ENTITY_LISTENERS_DOMAIN = defineBackgroundDomain({
  domain: 'entity-listeners',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

const RECONCILIATION_RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

/** One bounded page of candidates in a fixed window; a full page saves its cursor and continues. */
export const ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB =
  defineBackgroundJob<EntityReconciliationDispatchData>(ENTITY_LISTENERS_DOMAIN, {
    name: 'reconcileEntities',
    priority: PRIORITY_DISPATCH,
    ...RECONCILIATION_RETRY,
  })
export const ENTITY_LISTENERS_RECONCILE_ENTITY_JOB = defineBackgroundJob<ReconcileEntityData>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'reconcileEntity', priority: PRIORITY_TASK, ...RECONCILIATION_RETRY },
)

export const ENTITY_LISTENERS_URL_CREATED_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processUrlCreated', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_IMAGE_CREATED_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processImageCreated', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_USER_CREATED_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processUserCreated', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_USER_UPDATED_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processUserUpdated', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_USER_LOGGED_IN_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processUserLoggedIn', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB = defineBackgroundJob<{
  newUserId: string
  referrerId: string
}>(ENTITY_LISTENERS_DOMAIN, { name: 'processAutoFollowReferrer', priority: PRIORITY_TASK })
export const ENTITY_LISTENERS_POST_CREATED_JOB = defineBackgroundJob<ProcessPostCreatedJobData>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processPostCreated', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_POST_UPDATED_JOB = defineBackgroundJob<{
  id: string
  contentChanged?: boolean
}>(ENTITY_LISTENERS_DOMAIN, { name: 'processPostUpdated', priority: PRIORITY_TASK })
export const ENTITY_LISTENERS_POST_DELETED_JOB = defineBackgroundJob<{ id: string }>(
  ENTITY_LISTENERS_DOMAIN,
  { name: 'processPostDeleted', priority: PRIORITY_TASK },
)
export const ENTITY_LISTENERS_TOPIC_CREATED_JOB = defineBackgroundJob<{
  id: string
  updates: CreateTopicUpdates
}>(ENTITY_LISTENERS_DOMAIN, { name: 'processTopicCreated', priority: PRIORITY_TASK })
export const ENTITY_LISTENERS_TOPIC_UPDATED_JOB = defineBackgroundJob<{
  id: string
  updated_by_id?: string
}>(ENTITY_LISTENERS_DOMAIN, { name: 'processTopicUpdated', priority: PRIORITY_TASK })
export const ENTITY_LISTENERS_TOPIC_DELETED_JOB = defineBackgroundJob<{
  id: string
  updates: CreateTopicUpdates
}>(ENTITY_LISTENERS_DOMAIN, { name: 'processTopicDeleted', priority: PRIORITY_TASK })
export const ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB = defineBackgroundJob<{
  conversationId: string
  messageId: string
  senderId: string
}>(ENTITY_LISTENERS_DOMAIN, {
  name: 'processConversationMessageCreated',
  priority: PRIORITY_TASK,
})
export const ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB = defineBackgroundJob<{
  actorUserId: string
  userId: string
  communityId: string
}>(ENTITY_LISTENERS_DOMAIN, {
  name: 'processCommunityAgentPromptsDeactivated',
  priority: PRIORITY_TASK,
})

export const ENTITY_LISTENERS_JOBS = [
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITY_JOB,
  ENTITY_LISTENERS_URL_CREATED_JOB,
  ENTITY_LISTENERS_IMAGE_CREATED_JOB,
  ENTITY_LISTENERS_USER_CREATED_JOB,
  ENTITY_LISTENERS_USER_UPDATED_JOB,
  ENTITY_LISTENERS_USER_LOGGED_IN_JOB,
  ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB,
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_POST_UPDATED_JOB,
  ENTITY_LISTENERS_POST_DELETED_JOB,
  ENTITY_LISTENERS_TOPIC_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_UPDATED_JOB,
  ENTITY_LISTENERS_TOPIC_DELETED_JOB,
  ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB,
  ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB,
] as const
