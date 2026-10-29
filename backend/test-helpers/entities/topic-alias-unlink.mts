import { beginTransaction, read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { TopicAliasUnlinkPage } from '../../queues/rss-feed-maintenance/types.mts'
import { clearTopicAliasUnlinkCategoryPage } from '../../services/rss-feed-items/clear-unlinked-topic-alias-categories.mts'
import {
  applyTopicAliasUnlinkPage as applyProductionTopicAliasUnlinkPage,
  selectTopicAliasUnlinkNextPage,
} from '../../services/topics/unlink-topic-alias-page.mts'
import { processReconcileTopicAliasCategoryMappings } from '../../services/rss-feeds/reconcile-topic-alias-category-mappings.mts'
import { normalizeHashtag } from '../../../ts-shared/utils/hashtags.mts'

/** Exercises the same callback wiring as the RSS maintenance worker. */
export function applyTopicAliasUnlinkPageForTest(
  page: TopicAliasUnlinkPage,
  options: QueryOptions = {},
) {
  return applyProductionTopicAliasUnlinkPage(page, {
    ...options,
    clearItemCategoryPage: clearTopicAliasUnlinkCategoryPage,
  })
}

/** Completes the real unlink page state machine and its durable category generation. */
export async function finishTopicAliasUnlinkForTest(aliasId: string): Promise<void> {
  const { rows: aliases } = await read<{ alias: string; unlink_requested_at: Date | null }>(
    `/* finishTopicAliasUnlinkForTest alias */
     SELECT alias, unlink_requested_at FROM topic_aliases WHERE id = $1::uuid`,
    [aliasId],
  )
  const alias = aliases[0]
  if (!alias?.unlink_requested_at) return
  await using lookup = await beginTransaction()
  let page: TopicAliasUnlinkPage | null = await selectTopicAliasUnlinkNextPage(
    lookup,
    aliasId,
    Boolean(normalizeHashtag(alias.alias)),
  )
  await lookup.rollback()
  for (let count = 0; count < 20 && page; count += 1) {
    page = await applyTopicAliasUnlinkPageForTest(page)
  }
  if (page) throw new Error('Test alias unlink exceeded twenty pages')
  for (let count = 0; count < 20; count += 1) {
    const result = await processReconcileTopicAliasCategoryMappings(1, [aliasId])
    if (!result.hasMore) return
  }
  throw new Error('Test alias category reconciliation exceeded twenty pages')
}
