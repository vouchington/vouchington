import { beginTransaction, read, write } from '@data-stores/psql'
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

/** Reads the first owned unlink page without advancing its transaction. */
export async function selectTopicAliasUnlinkInitialPageForTest(
  aliasId: string,
  aliasText: string,
): Promise<TopicAliasUnlinkPage> {
  await using lookup = await beginTransaction()
  const page = await selectTopicAliasUnlinkNextPage(
    lookup,
    aliasId,
    Boolean(normalizeHashtag(aliasText)),
  )
  await lookup.rollback()
  return page
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

/** Puts a linked alias into the accepted-unlink state without running the bounded deletion. */
export async function markTopicAliasPendingUnlinkForTest(
  alias: string,
  topicId: string,
): Promise<void> {
  await write(
    `/* markTopicAliasPendingUnlinkForTest */ UPDATE topic_aliases
      SET topic_id = NULL, unlink_requested_at = CURRENT_TIMESTAMP, unlink_topic_id = $2::uuid
      WHERE alias = $1`,
    [alias, topicId],
  )
}

/** Returns the pending-unlink alias row, or null when the alias is not pending. */
export async function getPendingTopicAliasForTest(
  alias: string,
): Promise<{ topic_id: string | null; unlink_topic_id: string | null } | null> {
  const { rows } = await read<{ topic_id: string | null; unlink_topic_id: string | null }>(
    `/* getPendingTopicAliasForTest */ SELECT topic_id, unlink_topic_id
      FROM topic_aliases WHERE alias = $1 AND unlink_requested_at IS NOT NULL`,
    [alias],
  )
  return rows[0] ?? null
}
