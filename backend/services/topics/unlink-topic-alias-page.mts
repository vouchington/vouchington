import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueTopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import {
  lockTopicAliasPublicationScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import { normalizeHashtag } from '@ts-shared/utils'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import {
  deleteTopicAliasUnlinkPhase,
  finalizeTopicAliasUnlink,
  lockPendingAlias,
} from './unlink-topic-alias-phase.mts'
import { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-next-page.mts'

export { recoverTopicAliasUnlinks } from './unlink-topic-alias-recovery.mts'
export { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-next-page.mts'

export type ClearTopicAliasUnlinkCategoryPage = (
  query: TransactionQuery,
  aliasId: string,
  alias: string,
  rows: ReadonlyArray<{ rss_feed_item_id: string; category_identity_id: string }>,
) => Promise<void>

export type ApplyTopicAliasUnlinkPageOptions = QueryOptions & {
  clearItemCategoryPage: ClearTopicAliasUnlinkCategoryPage
}

export async function applyTopicAliasUnlinkPage(
  page: TopicAliasUnlinkPage,
  options: ApplyTopicAliasUnlinkPageOptions,
): Promise<TopicAliasUnlinkPage | null> {
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [page.topicAliasId])
    if (page.phase === 'rss_item_categories')
      await clearUnlinkCategoryPageBeforeBindingRemoval(query, page, options.clearItemCategoryPage)
    const alias = await lockPendingAlias(query, page.topicAliasId)
    if (!alias) return null
    const preservesHashtag = Boolean(normalizeHashtag(alias.alias))
    const current = await selectTopicAliasUnlinkNextPage(query, alias.id, preservesHashtag)
    if (current.phase !== page.phase || current.pageCursor !== page.pageCursor) return current
    if (current.phase === 'finalize') {
      await finalizeTopicAliasUnlink(query, alias, preservesHashtag)
      return null
    }
    const captured = await deleteTopicAliasUnlinkPhase(query, alias, current)
    if (captured.postIds.length === 0 && captured.rssFeedItemIds.length === 0) {
      throw new Error(`Topic alias unlink page ${current.phase} did not advance`)
    }
    await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: alias.id },
      reason: 'post_topics_changed',
      impactedTopicIds: [alias.unlink_topic_id],
      impactedPostIds: captured.postIds,
      impactedRssFeedItemIds: captured.rssFeedItemIds,
      topicAliasText: alias.alias,
    })
    return selectTopicAliasUnlinkNextPage(query, alias.id, preservesHashtag)
  }

  if (options.query || options.client) {
    const next = await withTransactionOptions(options, run)
    if (next && options.query) {
      registerPostCommitAction(options.query, () =>
        awaitReportedEnqueueAdmission(() => enqueueTopicAliasUnlinkPage(next)),
      )
    }
    return next
  }

  await using transaction = await beginTransaction()
  const next = await run(transaction)
  await transaction.commit()
  if (next) await enqueueTopicAliasUnlinkPage(next)
  return next
}

async function clearUnlinkCategoryPageBeforeBindingRemoval(
  query: TransactionQuery,
  page: TopicAliasUnlinkPage,
  clearItemCategoryPage: ClearTopicAliasUnlinkCategoryPage,
): Promise<void> {
  const { rows } = await query<{
    alias: string
    rss_feed_item_id: string
    category_identity_id: string
  }>(
    `/* clearUnlinkCategoryPageBeforeBindingRemoval */
     SELECT alias.alias, category.rss_feed_item_id, category.category_identity_id
     FROM topic_aliases alias
     JOIN rss_feed_item_categories category ON category.topic_alias_id = alias.id
     WHERE alias.id = $1::uuid AND alias.unlink_requested_at IS NOT NULL
     ORDER BY category.rss_feed_item_id DESC, category.category_identity_id
     LIMIT $2::integer`,
    [page.topicAliasId, getPostPublicationWorkLimit('topic_alias_unlink_page_size')],
  )
  const first = rows[0]
  if (!first || `${first.rss_feed_item_id}_${first.category_identity_id}` !== page.pageCursor)
    return
  await clearItemCategoryPage(query, page.topicAliasId, first.alias, rows)
}
