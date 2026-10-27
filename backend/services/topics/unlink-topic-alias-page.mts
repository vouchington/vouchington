import {
  beginTransaction,
  read,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueContinuePostPublicationReconciliation } from '@queues/post-publication/enqueues'
import { enqueueTopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import {
  lockTopicAliasPublicationScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import { normalizeHashtag } from '@ts-shared/utils'
import {
  deleteTopicAliasUnlinkPhase,
  finalizeTopicAliasUnlink,
  lockPendingAlias,
} from './unlink-topic-alias-phase.mts'
import {
  selectTopicAliasUnlinkNextPage,
  type TopicAliasUnlinkSql,
} from './unlink-topic-alias-next-page.mts'

export { recoverTopicAliasUnlinks } from './unlink-topic-alias-recovery.mts'
export { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-next-page.mts'

const readUnlinkPrimary: TopicAliasUnlinkSql = (sql, params) =>
  read(sql, params ? [...params] : [], { readOnly: false })

export async function applyTopicAliasUnlinkPage(
  page: TopicAliasUnlinkPage,
  options: QueryOptions = {},
): Promise<TopicAliasUnlinkPage | null> {
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [page.topicAliasId])
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
    registerPostCommitAction(query, () =>
      awaitReportedEnqueueAdmission(() => enqueueContinuePostPublicationReconciliation()),
    )
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

/** Applies the alias's current page. Returns false once the unlink is no longer pending. */
export async function continueTopicAliasUnlink(topicAliasId: string): Promise<boolean> {
  const { rows } = await readUnlinkPrimary<{ alias: string }>(
    `/* continueTopicAliasUnlink */
    SELECT alias FROM topic_aliases
    WHERE id = $1::uuid AND unlink_requested_at IS NOT NULL`,
    [topicAliasId],
  )
  const alias = rows[0]
  if (!alias) return false
  const page = await selectTopicAliasUnlinkNextPage(
    readUnlinkPrimary,
    topicAliasId,
    Boolean(normalizeHashtag(alias.alias)),
  )
  await applyTopicAliasUnlinkPage(page)
  return true
}
