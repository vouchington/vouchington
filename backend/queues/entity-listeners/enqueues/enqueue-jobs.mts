/**
 * Internal per-job enqueue functions, split out of enqueues.mts (concern: job-level
 * createBackgroundEnqueue/createBackgroundBulkEnqueue wiring, as opposed to enqueues.mts's public
 * enqueueOn/enqueueBulkOn wrapper API). Not part of `@queues/entity-listeners/enqueues`'s public
 * surface. Priorities come from the job definitions; a caller's priority overrides them per call.
 */

import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type { NoSensitiveFields } from '@data-stores/valkey-glide-mq/glide-mq-payload-types'
import {
  ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB,
  ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB,
  ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB,
  ENTITY_LISTENERS_IMAGE_CREATED_JOB,
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_POST_DELETED_JOB,
  ENTITY_LISTENERS_POST_UPDATED_JOB,
  ENTITY_LISTENERS_TOPIC_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_DELETED_JOB,
  ENTITY_LISTENERS_TOPIC_UPDATED_JOB,
  ENTITY_LISTENERS_URL_CREATED_JOB,
  ENTITY_LISTENERS_USER_CREATED_JOB,
  ENTITY_LISTENERS_USER_LOGGED_IN_JOB,
  ENTITY_LISTENERS_USER_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import type { EnqueueReturnType } from '@voucha/types'

function createEntityEnqueue<TData>(job: BackgroundJobDefinition<TData, false>) {
  const enqueue = createBackgroundEnqueue(job)
  return (data: NoSensitiveFields<TData>, priority?: number): EnqueueReturnType => {
    return enqueue(data, priority === undefined ? undefined : { priority })
  }
}

export const enqueueProcessUserCreated = createEntityEnqueue(ENTITY_LISTENERS_USER_CREATED_JOB)
export const enqueueProcessAutoFollowReferrer = createEntityEnqueue(
  ENTITY_LISTENERS_AUTO_FOLLOW_REFERRER_JOB,
)
export const enqueueProcessUserLoggedIn = createEntityEnqueue(ENTITY_LISTENERS_USER_LOGGED_IN_JOB)
export const enqueueProcessUserUpdated = createEntityEnqueue(ENTITY_LISTENERS_USER_UPDATED_JOB)
export const enqueueProcessTopicCreated = createEntityEnqueue(ENTITY_LISTENERS_TOPIC_CREATED_JOB)
export const enqueueProcessTopicUpdated = createEntityEnqueue(ENTITY_LISTENERS_TOPIC_UPDATED_JOB)
export const enqueueProcessTopicDeleted = createEntityEnqueue(ENTITY_LISTENERS_TOPIC_DELETED_JOB)
export const enqueueProcessPostCreated = createEntityEnqueue(ENTITY_LISTENERS_POST_CREATED_JOB)
export const enqueueProcessPostUpdated = createEntityEnqueue(ENTITY_LISTENERS_POST_UPDATED_JOB)
export const enqueueBulkProcessPostUpdated = createBackgroundBulkEnqueue(
  ENTITY_LISTENERS_POST_UPDATED_JOB,
  (post: { id: string; contentChanged?: boolean }) => ({ data: post }),
)
export const enqueueProcessPostDeleted = createEntityEnqueue(ENTITY_LISTENERS_POST_DELETED_JOB)
export const enqueueProcessImageCreated = createEntityEnqueue(ENTITY_LISTENERS_IMAGE_CREATED_JOB)

export const enqueueBulkProcessUrlCreated = createBackgroundBulkEnqueue(
  ENTITY_LISTENERS_URL_CREATED_JOB,
  (id: string) => ({
    data: { id },
    opts: {
      deduplication: {
        id: `processUrlCreated__${id}`,
        mode: 'debounce',
      },
    },
  }),
)

export const enqueueProcessConversationMessageCreated = createEntityEnqueue(
  ENTITY_LISTENERS_CONVERSATION_MESSAGE_CREATED_JOB,
)

export const enqueueProcessCommunityAgentPromptsDeactivated = createEntityEnqueue(
  ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB,
)
