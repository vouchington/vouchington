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
/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/entity-listeners/README.md`.
 */
export const enqueueOnTopicDeleted = (
  id: string,
  updates: CreateTopicUpdates,
  priority?: number,
) => {
  return enqueueProcessTopicDeleted({ id, updates }, priority)
}
