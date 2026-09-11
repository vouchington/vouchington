import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT } from './config.mts'
import {
  enqueueProcessPostCreated,
  enqueueProcessPostUpdated,
  enqueueBulkProcessPostUpdated,
  enqueueProcessPostDeleted,
  enqueueProcessImageCreated,
  enqueueBulkProcessUrlCreated,
  enqueueProcessConversationMessageCreated,
  enqueueProcessCommunityAgentPromptsDeactivated,
} from './enqueues/enqueue-jobs.mts'

export * from './enqueues/users.mts'
export * from './enqueues/topics.mts'
export * from './enqueues/reconciliation.mts'

export const enqueueOnPostCreated = (id: string, priority?: number) => {
  return enqueueProcessPostCreated({ id }, priority)
}
export const enqueueOnPostUpdated = (
  id: string,
  options?: {
    contentChanged?: boolean
  },
  priority?: number,
) => {
  return enqueueProcessPostUpdated({ id, ...options }, priority)
}
export const enqueueBulkOnPostUpdated = (
  posts: Array<{
    id: string
    contentChanged?: boolean
  }>,
  priority?: number,
) => {
  return enqueueBulkProcessPostUpdated(posts, priority === undefined ? undefined : { priority })
}
export const enqueueOnPostDeleted = (id: string, priority?: number) => {
  return enqueueProcessPostDeleted({ id }, priority)
}
export const enqueueOnImageCreated = (id: string, priority?: number) => {
  return enqueueProcessImageCreated({ id }, priority)
}
export const enqueueOnConversationMessageCreated = (
  conversationId: string,
  messageId: string,
  senderId: string,
  priority?: number,
) => {
  return enqueueProcessConversationMessageCreated({ conversationId, messageId, senderId }, priority)
}
export const enqueueBulkOnUrlCreated = (ids: string[], priority?: number): EnqueueReturnType => {
  return enqueueBulkProcessUrlCreated(ids, {
    priority: priority ?? PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}
export const enqueueOnCommunityAgentPromptsDeactivated = (
  actorUserId: string,
  userId: string,
  communityId: string,
  priority?: number,
) => {
  return enqueueProcessCommunityAgentPromptsDeactivated(
    { actorUserId, userId, communityId },
    priority,
  )
}
