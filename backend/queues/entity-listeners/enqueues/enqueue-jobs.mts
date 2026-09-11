/**
 * Internal per-job enqueue functions, split out of enqueues.mts (concern: job-level
 * createEntityEnqueue/createBulkEnqueueFunction wiring, as opposed to enqueues.mts's public
 * enqueueOn/enqueueBulkOn wrapper API). Not part of `@queues/entity-listeners/enqueues`'s public
 * surface.
 */

import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { entitiesListeners } from '../queues.mts'
import type {
  CreateTopicUpdates,
  EntityJobs,
  ProcessPostCreatedJobData,
  UserLoginContext,
} from '../types.mts'

const ONE_MINUTE_MS = 60_000

function createEntityEnqueue<TData extends Record<string, unknown>>(jobName: EntityJobs) {
  const enqueue = createEnqueueFunction<TData, EntityJobs>({
    queue: entitiesListeners,
    queueName: QUEUE_NAME,
    jobName,
  })

  return (data: TData, priority = PRIORITY_DEFAULT): EnqueueReturnType => {
    return enqueue(data, { priority })
  }
}

export const enqueueProcessUserCreated = createEntityEnqueue<{
  id: string
  context: UserLoginContext
}>('processUserCreated')
export const enqueueProcessAutoFollowReferrer = createEntityEnqueue<{
  newUserId: string
  referrerId: string
}>('processAutoFollowReferrer')
export const enqueueProcessUserLoggedIn = createEntityEnqueue<{
  id: string
  context: UserLoginContext
}>('processUserLoggedIn')
export const enqueueProcessUserUpdated = createEntityEnqueue<{ id: string }>('processUserUpdated')
export const enqueueProcessTopicCreated = createEntityEnqueue<{
  id: string
  updates: CreateTopicUpdates
}>('processTopicCreated')
export const enqueueProcessTopicUpdated = createEntityEnqueue<{
  id: string
  updated_by_id?: string
}>('processTopicUpdated')
export const enqueueProcessTopicDeleted = createEntityEnqueue<{
  id: string
  updates: CreateTopicUpdates
}>('processTopicDeleted')
export const enqueueProcessPostCreated =
  createEntityEnqueue<ProcessPostCreatedJobData>('processPostCreated')
export const enqueueProcessPostUpdated = createEntityEnqueue<{
  id: string
  contentChanged?: boolean
}>('processPostUpdated')
export const enqueueBulkProcessPostUpdated = createBulkEnqueueFunction<
  { id: string; contentChanged?: boolean },
  { id: string; contentChanged?: boolean },
  EntityJobs
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'processPostUpdated',
  buildJob: post => ({ data: post }),
})
export const enqueueProcessPostDeleted = createEntityEnqueue<{ id: string }>('processPostDeleted')
export const enqueueProcessImageCreated = createEntityEnqueue<{ id: string }>('processImageCreated')

export const enqueueBulkProcessUrlCreated = createBulkEnqueueFunction<
  string,
  { id: string },
  EntityJobs
>({
  queue: entitiesListeners,
  queueName: QUEUE_NAME,
  jobName: 'processUrlCreated',
  buildJob: id => ({
    data: { id },
    opts: {
      deduplication: {
        id: `processUrlCreated__${id}`,
        mode: 'debounce',
        ttl: ONE_MINUTE_MS,
      },
    },
  }),
})

export const enqueueProcessConversationMessageCreated = createEntityEnqueue<{
  conversationId: string
  messageId: string
  senderId: string
}>('processConversationMessageCreated')

export const enqueueProcessCommunityAgentPromptsDeactivated = createEntityEnqueue<{
  actorUserId: string
  userId: string
  communityId: string
}>('processCommunityAgentPromptsDeactivated')
