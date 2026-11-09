import { withStoryCategoryPlanBacklog } from './story-category-projection-claim.mts'
import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { capture, capturePage, pageSize } from './story-category-projection-capture.mts'
import { markStoryCategoryProjectionWork } from '@services/post-publication/story-category-projection-work'
import {
  deleteStaleCategoriesAndRetractVotes,
  markReconciledCategorySnapshotStories,
} from '@services/rss-feed-items/reconcile-categories-delete'
import { seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const suffix = v7()
const storyId = v7()
const emptyStoryId = v7()
const postId = v7()
const itemId = v7()
const categoryIds = Array.from({ length: pageSize + 1 }, () => v7()).toSorted()
const topicIds = categoryIds.map((_, index) => seedUuid(index, '04'))
const pruneTopicIds = Array.from({ length: 1101 }, (_, index) => seedUuid(index, '04'))

/** Scoped real work pages; each capture rolls back so its SQL can be replayed on the same fixture. */
export async function runStoryCategoryProjectionScenarios(): Promise<void> {
  await withStoryCategoryPlanBacklog(runStoryCategoryFixtureScenarios)
}

async function runStoryCategoryFixtureScenarios(): Promise<void> {
  const anchor = await write<{ id: string; hostname_id: string }>(
    '/* storyCategoryPlanUrl */ SELECT id, hostname_id FROM urls WHERE hostname_id IS NOT NULL ORDER BY id LIMIT 1',
  )
  assert.ok(anchor.rows[0])
  try {
    await write(
      '/* seedStoryCategoryPlanStories */ INSERT INTO stories (id, title) SELECT id, $2 FROM unnest($1::uuid[]) AS input(id)',
      [[storyId, emptyStoryId], `category-plan-${suffix}`],
    )
    await write(
      `/* seedStoryCategoryPlanPost */ INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
      VALUES ($1, $2, 'discussion', 'Category plan', '', 'system', decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'))`,
      [postId, seedUser.id],
    )
    await write(
      '/* seedStoryCategoryPlanPostLink */ INSERT INTO story_posts (post_id, story_id, initiated_by_id) VALUES ($1, $2, $3)',
      [postId, storyId, seedUser.id],
    )
    await write(
      '/* seedStoryCategoryPlanGuid */ INSERT INTO rss_feed_item_guids (id, guid, url_hostname_id) VALUES ($1, $2, $3)',
      [itemId, `category-plan-${suffix}`, anchor.rows[0].hostname_id],
    )
    await write(
      `/* seedStoryCategoryPlanItem */ INSERT INTO rss_feed_items (id, url_id, story_id, data, bedrock_nova_multimodal_v1_content_sha256)
      VALUES ($1, $2, $3, '{}'::jsonb, decode(repeat('00',32),'hex'))`,
      [itemId, anchor.rows[0].id, storyId],
    )
    await write(
      `/* seedStoryCategoryPlanIdentities */ INSERT INTO rss_category_identities (id, category_text)
      SELECT id, 'category-plan-' || id::text FROM unnest($1::uuid[]) AS input(id)`,
      [categoryIds],
    )
    await write(
      `/* seedStoryCategoryPlanCategories */ INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_identity_id, category_text, topic_id)
      SELECT $1, id, 'category-plan-' || id::text, topic_id FROM unnest($2::uuid[], $3::uuid[]) AS input(id, topic_id)`,
      [itemId, categoryIds, topicIds],
    )
    await using setup = await beginTransaction()
    await markStoryCategoryProjectionWork(setup, [storyId, emptyStoryId])
    await setup.commit()
    await write(
      '/* analyzeStoryCategoryPlan */ ANALYZE story_post_category_projection_jobs, story_post_category_projection_receipts, rss_feed_items, rss_feed_item_categories, relation__post__category__topic',
    )
    await capture(
      'story-category-mark',
      ['markStoryCategoryProjectionWork', 'setStoryCategoryProjectionHighWater'],
      async query => {
        await markStoryCategoryProjectionWork(query, [storyId])
      },
    )
    await capture(
      'story-category-snapshot-mark',
      [
        'readStoriesForCategorySnapshotProjection',
        'markStoryCategoryProjectionWork',
        'setStoryCategoryProjectionHighWater',
      ],
      async query => {
        const snapshots = [
          { rss_feed_item_id: itemId, categories: categoryIds.map(id => `category-plan-${id}`) },
        ]
        const result = await deleteStaleCategoriesAndRetractVotes(snapshots, query)
        await markReconciledCategorySnapshotStories(snapshots, query)
        assert.equal(result.staleCategories.length, 0)
      },
    )
    await capturePage('story-category-source-page', storyId, [
      'claimStoryCategoryProjection',
      'readStoryCategoryProjectionPost',
      'nextStoryCategorySourceItem',
      'listStoryCategorySourcePage',
      'recordStoryCategoryProjectionReceipts',
      'advanceStoryCategorySourcePage',
      'touchStoryCategoryProjectionWork',
    ])
    await write(
      '/* prepareStoryCategoryLastSourcePage */ UPDATE story_post_category_projection_jobs SET active_item_id = $2, cursor_category_identity_id = $3 WHERE story_id = $1',
      [storyId, itemId, categoryIds[99]],
    )
    await capturePage('story-category-source-last-page', storyId, [
      'listStoryCategorySourcePage',
      'advanceStoryCategorySourceItem',
    ])
    await write(
      '/* prepareStoryCategorySourceEnd */ UPDATE story_post_category_projection_jobs SET active_item_id = NULL, cursor_category_identity_id = NULL, cursor_item_id = $2 WHERE story_id = $1',
      [storyId, itemId],
    )
    await capturePage('story-category-source-end', storyId, [
      'nextStoryCategorySourceItem',
      'finishStoryCategorySource',
    ])
    await write(
      `/* prepareStoryCategoryPrune */ INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id, deleted_at)
      SELECT $1, id, $2, CASE WHEN ordinal <= 1000 THEN CURRENT_TIMESTAMP ELSE NULL END
      FROM unnest($3::uuid[]) WITH ORDINALITY AS input(id, ordinal)`,
      [postId, seedUser.id, pruneTopicIds],
    )
    await write('/* analyzeStoryCategoryPrune */ ANALYZE relation__post__category__topic')
    await write(
      `/* prepareStoryCategoryReceipts */ INSERT INTO story_post_category_projection_receipts (story_id, topic_id, generation)
      SELECT $1, id, 2 FROM unnest($2::uuid[]) AS input(id)`,
      [storyId, pruneTopicIds],
    )
    await write(
      '/* analyzeStoryCategoryReceipts */ ANALYZE story_post_category_projection_receipts',
    )
    await write(
      '/* prepareStoryCategoryPruneWork */ UPDATE story_post_category_projection_jobs SET source_completed_at = CURRENT_TIMESTAMP WHERE story_id = $1',
      [storyId],
    )
    await capturePage('story-category-prune-page', storyId, [
      'listStoryCategoryRelationPage',
      'pruneStoryCategoryRelationPage',
      'advanceStoryCategoryRelationPage',
    ])
    await write(
      '/* prepareStoryCategoryLivePrune */ UPDATE story_post_category_projection_jobs SET cursor_relation_topic_id = $2 WHERE story_id = $1',
      [storyId, pruneTopicIds[999]],
    )
    await capturePage('story-category-prune-live-page', storyId, [
      'listStoryCategoryRelationPage',
      'pruneStoryCategoryRelationPage',
      'advanceStoryCategoryRelationPage',
    ])
    await write(
      '/* prepareStoryCategoryReceiptWork */ UPDATE story_post_category_projection_jobs SET relations_completed_at = CURRENT_TIMESTAMP WHERE story_id = $1',
      [storyId],
    )
    await capturePage('story-category-receipt-page', storyId, [
      'listStoryCategoryReceiptPage',
      'deleteStoryCategoryReceiptPage',
      'advanceStoryCategoryReceiptPage',
    ])
    await write(
      '/* prepareStoryCategoryReceiptEnd */ UPDATE story_post_category_projection_jobs SET cursor_receipt_topic_id = $2 WHERE story_id = $1',
      [storyId, pruneTopicIds[1099]],
    )
    await capturePage('story-category-receipt-end', storyId, [
      'listStoryCategoryReceiptPage',
      'deleteStoryCategoryReceiptPage',
      'completeStoryCategoryProjection',
    ])
    await capturePage('story-category-missing-post', emptyStoryId, [
      'skipMissingStoryCategoryProjectionPost',
    ])
  } finally {
    await write('/* cleanupStoryCategoryPlanPost */ DELETE FROM posts WHERE id = $1', [postId])
    await write('/* cleanupStoryCategoryPlanItem */ DELETE FROM rss_feed_items WHERE id = $1', [
      itemId,
    ])
    await write(
      '/* cleanupStoryCategoryPlanGuid */ DELETE FROM rss_feed_item_guids WHERE id = $1',
      [itemId],
    )
    await write(
      '/* cleanupStoryCategoryPlanIdentities */ DELETE FROM rss_category_identities WHERE id = ANY($1::uuid[])',
      [categoryIds],
    )
    await write(
      '/* cleanupStoryCategoryPlanStories */ DELETE FROM stories WHERE id = ANY($1::uuid[])',
      [[storyId, emptyStoryId]],
    )
  }
}
