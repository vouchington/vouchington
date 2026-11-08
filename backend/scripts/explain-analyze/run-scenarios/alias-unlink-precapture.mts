import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  postPublicationWorkConfig,
  postPublicationWorkMaxValues,
} from '@services/post-publication/work-limits'
import {
  deleteTopicAliasUnlinkPhase,
  finalizeTopicAliasUnlink,
} from '@services/topics/unlink-topic-alias-phase'
import { stageTopicAliasUnlinkPage } from '@services/topics/unlink-topic-alias-stage'
import { registerScenarioContract } from '../plan-expectations.mts'
import { captureAliasUnlinkControlScenarios } from './alias-unlink-controls.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import { PUBLICATION_SCOPE_SEED as seed } from '../seed-data/publication-scope-pages.mts'
import {
  ALIAS_UNLINK_ITEM_COUNT as ITEM_COUNT,
  cleanupAliasUnlinkFixture,
  seedAliasUnlinkFixture,
} from '../seed-data/alias-unlink-precapture.mts'

const PAGE_SIZE = postPublicationWorkMaxValues.topic_alias_unlink_page_size
type TopicAliasUnlinkPage = Parameters<typeof stageTopicAliasUnlinkPage>[0]

const fixtureRows = {
  post_topic_alias_sources: seed.count * 6,
  relation__post__category__topic_alias: seed.count * 2,
  rss_feed_item_categories: seed.count * 2 + ITEM_COUNT * 11,
  relation__rss_feed_item__category__topic_alias:
    (SEEDED_ROWS_BY_RELATION.relation__rss_feed_item__category__topic_alias ?? 0) + ITEM_COUNT,
}

const phases = [
  {
    phase: 'post_sources',
    relation: 'post_topic_alias_sources',
    index: 'idx_post_topic_alias_sources__topic_alias_id',
    deleteName: 'deletePostSources remove',
    key: 'postIds',
  },
  {
    phase: 'post_relations',
    relation: 'relation__post__category__topic_alias',
    index: 'relation__post__category__topic_alias__object_id_subject_id_idx',
    deleteName: 'deletePostRelations remove',
    key: 'postIds',
  },
  {
    phase: 'rss_item_categories',
    relation: 'rss_feed_item_categories',
    index: 'idx_rss_feed_item_categories__topic_alias_id',
    deleteName: 'clearRssItemCategories clear',
    key: 'rssFeedItemIds',
  },
  {
    phase: 'rss_item_relations',
    relation: 'relation__rss_feed_item__category__topic_alias',
    index: 'idx_relatio__rss_feed_item__categor__topic_alias__reverse_index',
    deleteName: 'deleteRssItemRelations remove',
    key: 'rssFeedItemIds',
  },
] as const

/** Capture the actual bounded pre-read and conditional write for each unlink phase. */
export async function captureAliasUnlinkPrecaptureScenarios(): Promise<void> {
  let restore: (() => void) | undefined
  try {
    await cleanupAliasUnlinkFixture()
    await seedAliasUnlinkFixture()
    await postPublicationWorkConfig.waitForInitialization()
    restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      topic_alias_unlink_page_size: PAGE_SIZE,
    })
    for (const { phase, relation, index, deleteName, key } of phases) {
      const page = { topicAliasId: seed.alias, phase, pageCursor: '' } as TopicAliasUnlinkPage
      // no-mistakes-disable-next-line query-reached-per-item: four fixed phase fixtures each need their actual staged key page.
      const staged = await stageTopicAliasUnlinkPage(page)
      assert(staged.phase !== 'finalize', `${phase} fixture stages a child page`)
      assert.equal(staged.rows.length, PAGE_SIZE, `hot ${phase} fixture needs a full page`)
      const first = staged.rows[0]!
      page.pageCursor =
        'id' in first ? first.id : `${first.rss_feed_item_id}_${first.category_identity_id}`

      const stageId = `publication-alias-unlink-${phase}-stage`
      registerScenarioContract(stageId, {
        seededRows: fixtureRows,
        expectations: [
          { kind: 'usesIndexes', indexes: [index], noSort: true },
          { kind: 'maxProcessedRows', relation, max: PAGE_SIZE },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: one fixed real selector per phase.
      await runAndCapture(stageId, async () => {
        const selected = await stageTopicAliasUnlinkPage(page)
        assert.equal(selected.rows.length, PAGE_SIZE)
      })

      const writeId = `publication-alias-unlink-${phase}-write`
      registerScenarioContract(writeId, {
        seededRows: fixtureRows,
        expectations: [
          { kind: 'maxProcessedRows', relation, max: PAGE_SIZE * 2 },
          { kind: 'maxBitmapIndexRows', max: PAGE_SIZE * 2 },
          { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 1 },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: each fixed phase captures its real conditional mutation and rolls it back.
      await runAndCapture(
        writeId,
        async () => {
          await using transaction = await beginTransaction()
          const changed = await deleteTopicAliasUnlinkPhase(
            transaction,
            { id: seed.alias, alias: 'seed-publication-scope', unlink_topic_id: seed.topic },
            page,
            staged,
          )
          assert.equal(changed[key].length, PAGE_SIZE)
          await transaction.rollback()
        },
        undefined,
        phase === 'rss_item_categories' ? undefined : deleteName,
      )
    }
    registerScenarioContract('publication-alias-unlink-finalize-guard', {
      allowEmptyResult: true,
      seededRows: fixtureRows,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 2 },
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
      'publication-alias-unlink-finalize-guard',
      async () => {
        await using transaction = await beginTransaction()
        const finalized = await finalizeTopicAliasUnlink(
          transaction,
          { id: seed.alias, alias: 'seed-publication-scope', unlink_topic_id: seed.topic },
          false,
        )
        assert.equal(finalized, false)
        await transaction.rollback()
      },
      undefined,
      'finalizeTopicAliasUnlink deleteOrdinaryAlias',
    )
    await captureAliasUnlinkControlScenarios()
  } finally {
    restore?.()
    await cleanupAliasUnlinkFixture()
  }
}
