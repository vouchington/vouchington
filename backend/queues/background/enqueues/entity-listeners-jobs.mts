import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import type {
  CreateTopicUpdates,
  EntityReconciliationDispatchData,
  ProcessPostCreatedJobData,
  ReconcileEntityData,
  UserLoginContext,
} from './entity-listeners-payloads.mts'

// The old queue had no queue-wide cap, ordering key, or limiter: its jobs ran under the worker's
// concurrency (baseline 5), so the domain has no group. Reconciliation pages itself (the sweep
// saves a cursor and moves itself to delayed), so no job here fans out unbounded.
export const ENTITY_LISTENERS_DOMAIN = defineBackgroundDomain({
  domain: 'entity-listeners',
  group: { kind: 'none' },
  workerConcurrency: 5,
})

const RECONCILIATION_RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

const task = <TData,>(name: string) =>
  defineBackgroundJob<TData>(ENTITY_LISTENERS_DOMAIN, { name, priority: PRIORITY_TASK })

/** The scheduler's trigger: it only enqueues one reconciliation dispatch. */
export const ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB = defineBackgroundJob<
  Record<string, never>
>(ENTITY_LISTENERS_DOMAIN, {
  name: 'enqueueReconcileEntities',
  priority: PRIORITY_DISPATCH,
  ...RECONCILIATION_RETRY,
})
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

export const ENTITY_LISTENERS_URL_CREATED_JOB = task<{ id: string }>('processUrlCreated')
export const ENTITY_LISTENERS_IMAGE_CREATED_JOB = task<{ id: string }>('processImageCreated')
export const ENTITY_LISTENERS_USER_CREATED_JOB = task<{ id: string; context: UserLoginContext }>(
  'processUserCreated',
)
export const ENTITY_LISTENERS_USER_UPDATED_JOB = task<{ id: string }>('processUserUpdated')
export const ENTITY_LISTENERS_USER_LOGGED_IN_JOB = task<{ id: string; context: UserLoginContext }>(
  'processUserLoggedIn',
)
export const ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB = task<{
  newUserId: string
  referrerId: string
}>('processAutoFollowReferrer')
export const ENTITY_LISTENERS_POST_CREATED_JOB =
  task<ProcessPostCreatedJobData>('processPostCreated')
export const ENTITY_LISTENERS_POST_UPDATED_JOB = task<{ id: string; contentChanged?: boolean }>(
  'processPostUpdated',
)
export const ENTITY_LISTENERS_POST_DELETED_JOB = task<{ id: string }>('processPostDeleted')
export const ENTITY_LISTENERS_TOPIC_CREATED_JOB = task<{ id: string; updates: CreateTopicUpdates }>(
  'processTopicCreated',
)
export const ENTITY_LISTENERS_TOPIC_UPDATED_JOB = task<{ id: string; updated_by_id?: string }>(
  'processTopicUpdated',
)
export const ENTITY_LISTENERS_TOPIC_DELETED_JOB = task<{ id: string; updates: CreateTopicUpdates }>(
  'processTopicDeleted',
)
export const ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB = task<{
  conversationId: string
  messageId: string
  senderId: string
}>('processConversationMessageCreated')
export const ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB = task<{
  actorUserId: string
  userId: string
  communityId: string
}>('processCommunityAgentPromptsDeactivated')

export const ENTITY_LISTENERS_JOBS = [
  ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB,
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
