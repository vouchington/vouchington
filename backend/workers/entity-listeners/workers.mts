import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB,
  ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB,
  ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB,
  ENTITY_LISTENERS_DOMAIN,
  ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_IMAGE_CREATED_JOB,
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_POST_DELETED_JOB,
  ENTITY_LISTENERS_POST_UPDATED_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITY_JOB,
  ENTITY_LISTENERS_TOPIC_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_DELETED_JOB,
  ENTITY_LISTENERS_TOPIC_UPDATED_JOB,
  ENTITY_LISTENERS_URL_CREATED_JOB,
  ENTITY_LISTENERS_USER_CREATED_JOB,
  ENTITY_LISTENERS_USER_LOGGED_IN_JOB,
  ENTITY_LISTENERS_USER_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { parseEntityJob } from '@queues/entity-listeners/payload/job-payload'
import { processCommunityAgentPromptsDeactivated } from './processors/community-agent-prompts.mts'
import { processConversationMessageCreated } from './processors/conversations.mts'
import { processImageCreated } from './processors/images.mts'
import { processPostCreated, processPostDeleted, processPostUpdated } from './processors/posts.mts'
import { processReconciliationJob } from './processors/process-reconciliation-job.mts'
import { enqueueReconcileEntities, reconcileEntity } from './processors/reconciliation.mts'
import {
  processTopicCreated,
  processTopicDeleted,
  processTopicUpdated,
} from './processors/topics.mts'
import { processUrlCreated } from './processors/urls.mts'
import {
  processAutoFollowReferrer,
  processUserCreated,
  processUserLoggedIn,
  processUserUpdated,
} from './processors/users.mts'

const LOCAL_NAME_START = ENTITY_LISTENERS_DOMAIN.domain.length + 1

/** Validates the payload against the job's strict schema, then runs the listener. */
function listener<TData>(job: BackgroundJobDefinition<TData>, run: (data: TData) => unknown) {
  return backgroundHandler(job, queued =>
    run(parseEntityJob(job.name.slice(LOCAL_NAME_START), queued.data).data as TData),
  )
}

export const entityListenersHandlers = [
  listener(ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB, () => enqueueReconcileEntities()),
  // Validates its own payload: the sweep persists its cursor through the job.
  backgroundHandler(ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB, job => processReconciliationJob(job)),
  listener(ENTITY_LISTENERS_RECONCILE_ENTITY_JOB, reconcileEntity),
  listener(ENTITY_LISTENERS_URL_CREATED_JOB, processUrlCreated),
  listener(ENTITY_LISTENERS_IMAGE_CREATED_JOB, processImageCreated),
  listener(ENTITY_LISTENERS_USER_CREATED_JOB, processUserCreated),
  listener(ENTITY_LISTENERS_USER_UPDATED_JOB, processUserUpdated),
  listener(ENTITY_LISTENERS_USER_LOGGED_IN_JOB, processUserLoggedIn),
  listener(ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB, processAutoFollowReferrer),
  listener(ENTITY_LISTENERS_POST_CREATED_JOB, processPostCreated),
  listener(ENTITY_LISTENERS_POST_UPDATED_JOB, processPostUpdated),
  listener(ENTITY_LISTENERS_POST_DELETED_JOB, processPostDeleted),
  listener(ENTITY_LISTENERS_TOPIC_CREATED_JOB, processTopicCreated),
  listener(ENTITY_LISTENERS_TOPIC_UPDATED_JOB, processTopicUpdated),
  listener(ENTITY_LISTENERS_TOPIC_DELETED_JOB, processTopicDeleted),
  listener(ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB, processConversationMessageCreated),
  listener(
    ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB,
    processCommunityAgentPromptsDeactivated,
  ),
]
