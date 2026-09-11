import type { CreateTopicUpdates } from '../types.mts'
import {
  enqueueProcessTopicCreated,
  enqueueProcessTopicUpdated,
  enqueueProcessTopicDeleted,
} from './enqueue-jobs.mts'

export const enqueueOnTopicCreated = (
  id: string,
  updates: CreateTopicUpdates,
  priority?: number,
) => {
  return enqueueProcessTopicCreated({ id, updates }, priority)
}
export const enqueueOnTopicUpdated = (id: string, updated_by_id?: string, priority?: number) => {
  return enqueueProcessTopicUpdated({ id, updated_by_id }, priority)
}
export const enqueueOnTopicDeleted = (
  id: string,
  updates: CreateTopicUpdates,
  priority?: number,
) => {
  return enqueueProcessTopicDeleted({ id, updates }, priority)
}
