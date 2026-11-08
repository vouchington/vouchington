import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueTopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import { capturedPublicationKeys } from '@services/post-publication/captured-keys'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'
import { normalizeHashtag } from '@ts-shared/utils'
import {
  deleteTopicAliasUnlinkPhase,
  finalizeTopicAliasUnlink,
  getPendingAlias,
} from './unlink-topic-alias-phase.mts'
import { stageTopicAliasUnlinkPage } from './unlink-topic-alias-stage.mts'
import { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-next-page.mts'

export { recoverTopicAliasUnlinks } from './unlink-topic-alias-recovery.mts'
export { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-next-page.mts'

export type ClearTopicAliasUnlinkCategoryPage = (
  query: TransactionQuery,
  aliasId: string,
  alias: string,
  rows: ReadonlyArray<{ rss_feed_item_id: string; category_identity_id: string }>,
) => Promise<void>

export type ApplyTopicAliasUnlinkPageOptions = {
  clearItemCategoryPage: ClearTopicAliasUnlinkCategoryPage
}

export async function applyTopicAliasUnlinkPage(
  page: TopicAliasUnlinkPage,
  options: ApplyTopicAliasUnlinkPageOptions,
): Promise<TopicAliasUnlinkPage | null> {
  const staged = await stageTopicAliasUnlinkPage(page)
  const run = async (query: TransactionQuery) => {
    const alias = await getPendingAlias(query, page.topicAliasId)
    if (!alias) return null
    const preservesHashtag = Boolean(normalizeHashtag(alias.alias))
    const current = await selectTopicAliasUnlinkNextPage(query, alias.id, preservesHashtag)
    if (current.phase !== page.phase || current.pageCursor !== page.pageCursor) return current
    if (staged.phase === 'finalize') {
      const finalized = await finalizeTopicAliasUnlink(query, alias, preservesHashtag)
      return finalized ? null : selectTopicAliasUnlinkNextPage(query, alias.id, preservesHashtag)
    }
    if (staged.phase === 'rss_item_categories') {
      const first = staged.rows[0]
      if (first && `${first.rss_feed_item_id}_${first.category_identity_id}` === page.pageCursor)
        await options.clearItemCategoryPage(query, page.topicAliasId, alias.alias, staged.rows)
    }
    const captured = await deleteTopicAliasUnlinkPhase(query, alias, current, staged)
    if (captured.postIds.length > 0 || captured.rssFeedItemIds.length > 0)
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'topic_alias', topicAliasId: alias.id },
        reason: 'post_topics_changed',
        keys: capturedPublicationKeys({
          scope: { type: 'topic_alias', topicAliasId: alias.id },
          reason: 'post_topics_changed',
          impactedTopicIds: [alias.unlink_topic_id],
          impactedPostIds: captured.postIds,
          impactedRssFeedItemIds: captured.rssFeedItemIds,
          topicAliasText: alias.alias,
        }),
      })
    return selectTopicAliasUnlinkNextPage(query, alias.id, preservesHashtag)
  }

  await using transaction = await beginTransaction()
  const next = await run(transaction)
  await transaction.commit()
  if (next) await enqueueTopicAliasUnlinkPage(next)
  return next
}
