import { captureActivePostUrlSafety } from './story-post-url-active-safety.mts'
import {
  captureGenerationReset,
  captureRssGenerationReset,
  seedGenerationResetNoise,
  cleanupGenerationResetNoise,
} from './story-post-url-generation-resets.mts'
import { captureLoweredPostUrlCap } from './story-post-url-lowered-cap.mts'
import assert from 'node:assert/strict'
import { processStoryPostRelatedUrlProjectionEligibilityPage } from '@services/stories/story-post-related-url-projection-eligibility'
import { beginTransaction, write } from '@data-stores/psql'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { pruneObsoleteStoryPostRelatedUrlsForReplacement } from '@services/stories/story-post-related-url-projection-replacements'
import type { ProjectionWork } from '@services/stories/story-post-related-url-projection-types'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Reuse the owned hot corpus; rollback capture mutations before both prepared-plan replays. */
export async function captureStoryPostUrlReplacementScenarios(): Promise<void> {
  const { rows } = await write<{ id: string }>(
    `/* seedStoryPostUrlReplacementStory */ INSERT INTO stories (title)
      VALUES ('EXPLAIN atomic post URL replacements') RETURNING id`,
  )
  const storyId = rows[0]!.id
  let noiseStoryIds: string[] = []
  try {
    noiseStoryIds = await seedGenerationResetNoise()
    const work = await seedReplacementWork(storyId)
    await write(
      `/* seedStoryPostUrlReplacementStoryPost */
      INSERT INTO story_posts (post_id,story_id,initiated_by_id) VALUES ($1,$2,$3)`,
      [seed.posts[3], storyId, seed.user],
    )
    await seedReplacementReceipts(storyId)
    await write(`/* analyzeStoryPostUrlReplacements */
      ANALYZE story_post_related_url_projection_jobs,
        story_post_related_url_projection_receipts,
        story_post_related_url_projection_relation_mutations,
        story_posts, posts, rss_feed_items, relation__post__related__url`)
    await captureEligibilityCompletion(work[0]!)
    await captureGenerationReset(work[0]!)
    await captureRssGenerationReset(work[2]!)
    await captureReplacement('post-url-replacement-default', work[0]!, 1000)
    await captureReplacement('post-url-replacement-maximum', work[1]!, 10000)
    await captureLoweredPostUrlCap(work[1]!)
    await captureActivePostUrlSafety(work)
  } finally {
    await cleanupGenerationResetNoise(noiseStoryIds)
    await write(
      `/* cleanupStoryPostUrlReplacementWork */
      DELETE FROM story_post_related_url_projection_jobs WHERE story_id = $1`,
      [storyId],
    )
    await write(
      `/* cleanupStoryPostUrlReplacementItem */ DELETE FROM rss_feed_items WHERE id = $1`,
      [seedUuid(50, 'f6')],
    )
    await write(
      `/* cleanupStoryPostUrlReplacementGuid */ DELETE FROM rss_feed_item_guids WHERE id = $1`,
      [seedUuid(50, 'f6')],
    )
    await write(
      `/* cleanupStoryPostUrlReplacementItemIdentity */ DELETE FROM retained_rss_feed_item_identities WHERE id = $1`,
      [seedUuid(50, 'f6')],
    )
    await write(`/* cleanupStoryPostUrlReplacementStory */ DELETE FROM stories WHERE id = $1`, [
      storyId,
    ])
  }
}

async function seedReplacementWork(storyId: string): Promise<ProjectionWork[]> {
  const { rows } = await write<ProjectionWork>(
    `/* seedStoryPostUrlReplacementWork */
      INSERT INTO story_post_related_url_projection_jobs
        (post_id, story_id, sweep_upper_bound_relation_id, relation_snapshot_at,
         eligibility_completed_at, lease_token, leased_at, lease_expires_at)
      SELECT post_id, $2, (SELECT id FROM relation__post__related__url
        WHERE subject_id = post_id ORDER BY id DESC LIMIT 1), clock_timestamp(),
        clock_timestamp(), post_id, clock_timestamp(), clock_timestamp() + INTERVAL '1 day'
      FROM unnest($1::uuid[]) input(post_id)
      RETURNING post_id, story_id, generation, sweep_upper_bound_source_id,
        sweep_upper_bound_relation_id, relation_snapshot_at, cursor_source_id,
        eligibility_completed_at, source_completed_at, cursor_prune_id, limit_reached_capacity, lease_token`,
    [seed.posts, storyId],
  )
  await write(
    `/* seedStoryPostUrlReplacementFences */
    INSERT INTO story_post_related_url_projection_relation_mutations (post_id,generation,relation_id)
    SELECT subject_id, 1, id FROM relation__post__related__url
    WHERE subject_id = ANY($1::uuid[]) AND deleted_at IS NULL
      AND object_id < $2::uuid`,
    [seed.posts.slice(0, 2), seedUuid(350, 'f6')],
  )
  return rows
    .filter(row => [seed.posts[0], seed.posts[1], seed.posts[3]].includes(row.post_id))
    .toSorted((a, b) => a.post_id.localeCompare(b.post_id))
}

async function seedReplacementReceipts(storyId: string): Promise<void> {
  const itemId = seedUuid(50, 'f6')
  await using query = await beginTransaction()
  await query(
    `/* seedStoryPostUrlReplacementGuid */
    INSERT INTO rss_feed_item_guids (id,url_hostname_id,guid)
    VALUES ($1,$2,'seed-post-url-replacement-item')`,
    [itemId, seed.hostname],
  )
  await query(
    `/* seedStoryPostUrlReplacementItem */
    INSERT INTO rss_feed_items (id,url_id,story_id,data,bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1,$2,$3,'{}'::jsonb,decode(repeat('00',32),'hex'))`,
    [itemId, seed.activeUrl, storyId],
  )
  await query(
    `/* seedStoryPostUrlReplacementReceipts */
    INSERT INTO story_post_related_url_projection_receipts (post_id,generation,url_id,source_item_id,is_eligible)
    SELECT post_id,1,$2,$3,TRUE FROM unnest($1::uuid[]) input(post_id)`,
    [seed.posts, seed.activeUrl, itemId],
  )
  await query.commit()
}

async function captureReplacement(id: string, work: ProjectionWork, limit: number): Promise<void> {
  relationLimitsConfig.fields.set('post_related_url', limit)
  registerScenarioContract(id, {
    allowEmptyResult: true, // UPDATE has no RETURNING; its live mutation is checked below.
    seededRows: {
      relation__post__related__url: seed.relationRows,
      story_post_related_url_projection_jobs: seed.posts.length,
      story_post_related_url_projection_receipts: seed.posts.length,
      story_post_related_url_projection_relation_mutations: 500,
    },
    expectations: [
      // The 1,000-row union ends with an empty probe: 999/1,000 rounds to one row/loop,
      // so EXPLAIN counts 1,001 candidate reads. The maximum case has no terminal probe.
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__related__url',
        max: limit * 2 + (limit === 1000 ? 1 : 0),
      },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_related_url_projection_receipts',
        max: limit,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'story_post_related_url_projection_relation_mutations',
        max: limit,
      },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      await lockPostPublicationPostScopes(query, [work.post_id])
      await pruneObsoleteStoryPostRelatedUrlsForReplacement(query, work, seed.user, [])
      const { rows } = await query<{ count: number }>(
        `/* verifyStoryPostUrlReplacement */
        SELECT count(*)::integer AS count FROM relation__post__related__url
        WHERE subject_id = $1 AND deleted_at IS NULL`,
        [work.post_id],
      )
      assert.equal(rows[0]?.count, 250, 'Protected rows survive and obsolete rows are removed')
    },
    undefined,
    'pruneObsoleteStoryPostRelatedUrlsForReplacement',
  )
}

async function captureEligibilityCompletion(work: ProjectionWork): Promise<void> {
  const id = 'post-url-replacement-eligibility-phase'
  registerScenarioContract(id, {
    allowEmptyResult: true, // The domain result below proves that the keyed UPDATE matched.
    seededRows: { story_post_related_url_projection_jobs: seed.posts.length },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 1 },
    ],
  })
  await runAndCapture(
    id,
    async () =>
      assert.deepEqual(await processStoryPostRelatedUrlProjectionEligibilityPage(work), {
        processed: 0,
        continue: true,
      }),
    undefined,
    'completeStoryPostRelatedUrlProjectionEligibility',
  )
}
