import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { unlinkTopicAlias } from '@services/topics/delete-topic-aliases'
import {
  finalizeTopicAliasUnlink,
  getPendingAlias,
} from '@services/topics/unlink-topic-alias-phase'
import { selectTopicAliasUnlinkNextPage } from '@services/topics/unlink-topic-alias-next-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  ALIAS_UNLINK_HASHTAG_ID,
  ALIAS_UNLINK_MARK_ID,
} from '../seed-data/alias-unlink-precapture.mts'
import { PUBLICATION_SCOPE_SEED as seed } from '../seed-data/publication-scope-pages.mts'

/** Capture the bounded alias control reads and finalization guards. */
export async function captureAliasUnlinkControlScenarios(): Promise<void> {
  registerScenarioContract('publication-alias-unlink-pending-read', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'topic_aliases', max: 1 }],
  })
  await runAndCapture(
    'publication-alias-unlink-pending-read',
    async () => {
      await using transaction = await beginTransaction()
      assert.ok(await getPendingAlias(transaction, seed.alias))
      await transaction.rollback()
    },
    undefined,
    'getPendingAlias',
  )

  registerScenarioContract('publication-alias-unlink-next-page', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_topic_alias_sources', max: 1 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__rss_feed_item__category__topic_alias',
        max: 1,
      },
    ],
  })
  await runAndCapture(
    'publication-alias-unlink-next-page',
    async () => {
      await using transaction = await beginTransaction()
      const page = await selectTopicAliasUnlinkNextPage(transaction, seed.alias, false)
      assert.equal(page.phase, 'post_sources')
      await transaction.rollback()
    },
    undefined,
    'selectTopicAliasUnlinkNextPage',
  )

  registerScenarioContract('publication-alias-unlink-hashtag-finalize-guard', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 1 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__rss_feed_item__category__topic_alias',
        max: 1,
      },
    ],
  })
  await runAndCapture(
    'publication-alias-unlink-hashtag-finalize-guard',
    async () => {
      await using transaction = await beginTransaction()
      const finalized = await finalizeTopicAliasUnlink(
        transaction,
        {
          id: ALIAS_UNLINK_HASHTAG_ID,
          alias: '#seed-publication-alias-guard',
          unlink_topic_id: seed.topic,
        },
        true,
      )
      assert.equal(finalized, true, 'hashtag source rows remain after finalization')
      await transaction.rollback()
    },
    undefined,
    'finalizeTopicAliasUnlink preserveHashtag',
  )

  registerScenarioContract('publication-alias-unlink-mark', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 1 },
    ],
  })
  await runAndCapture('publication-alias-unlink-mark', async () => {
    await using transaction = await beginTransaction()
    const marked = await unlinkTopicAlias(ALIAS_UNLINK_MARK_ID, {
      query: transaction,
      expectedTopicId: seed.topic,
      skipSideEffects: true,
    })
    assert.equal(marked?.topic_id, null)
    await transaction.rollback()
  })
}
