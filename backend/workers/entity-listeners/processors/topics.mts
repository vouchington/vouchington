import { repairEntityBloomKeys } from '@services/entity-cache/repair-entity-keys'
import type { CreateTopicUpdates } from '@services/topics/types'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueCreateTopicEmbedding } from '@queues/bedrock-embeddings/enqueues'
import {
  enqueueBackfillCategoriesForTopicAliases,
  enqueueBackfillRssFeedCategoriesForTopicAlias,
} from '@queues/rss-feed-item-categories/enqueues'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'

export const processTopicCreated = async ({ id }: { id: string }) => {
  await repairEntityBloomKeys('topics', id)
  await invalidate.topics(id)
  void enqueueCreateTopicEmbedding(id)
  void enqueueBackfillCategoriesForTopicAliases(id)
  void enqueueBackfillRssFeedCategoriesForTopicAlias(id)
  void enqueueLanguageDetection('topic', id)
  void enqueueRefreshTopHashtags()
}

export const processTopicUpdated = async ({ id }: { id: string; updated_by_id?: string }) => {
  await repairEntityBloomKeys('topics', id)
  void enqueueCreateTopicEmbedding(id)
  void enqueueBackfillCategoriesForTopicAliases(id)
  void enqueueBackfillRssFeedCategoriesForTopicAlias(id)
  void enqueueLanguageDetection('topic', id)
  void enqueueRefreshTopHashtags()
}

export const processTopicDeleted = async ({ id }: { id: string; updates: CreateTopicUpdates }) => {
  await invalidate.topics(id)
  void enqueueRefreshTopHashtags()
}
