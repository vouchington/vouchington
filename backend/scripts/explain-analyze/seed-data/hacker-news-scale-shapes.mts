import assert from 'node:assert/strict'
import { beginTransaction, read, write } from '@data-stores/psql'
import { recomputePostHackerNewsFlags } from '@services/posts/hacker-news-flags'
import { buildHackerNewsPostUrlsSql } from '@services/urls/hacker-news-post-urls'
import { seedUuidAtTimestamp } from './common.mts'
import {
  HACKER_NEWS_SCALE_MATCH_COUNT,
  HACKER_NEWS_SCALE_UNVOTED_URL_COUNT,
  type HackerNewsScaleFixture,
} from './hacker-news-scale-storage.mts'

export type HackerNewsScaleShape = 'sparse' | 'zero' | 'related'

/** Mutate only owned URL facts/relations, then use the production flag recomputation service. */
export async function setHackerNewsScaleShape(
  fixture: HackerNewsScaleFixture,
  shape: HackerNewsScaleShape,
): Promise<void> {
  const relationPrefix = seedUuidAtTimestamp(fixture.decisionInstant.getTime() + 1_000, 0).slice(
    0,
    24,
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* setHackerNewsScaleTotals */ UPDATE url_hacker_news_totals
     SET story_count = CASE WHEN $2 THEN 1 ELSE 0 END, looked_up_at = now()
     WHERE url_id = ANY($1::uuid[])`,
    [fixture.urlIds, shape !== 'zero'],
  )
  await transaction(
    `/* removeHackerNewsScaleHeavyUrls */ DELETE FROM relation__post__related__url
     WHERE subject_id = $1 AND object_id = ANY($2::uuid[])`,
    [fixture.heavyPostId, fixture.urlIds.slice(1)],
  )
  if (shape === 'related') {
    await transaction(
      `/* seedHackerNewsScaleUnvotedUrls */ INSERT INTO relation__post__related__url
       (id, subject_id, object_id, created_by_id)
       SELECT ($1 || lpad(to_hex(40_001_000 + fixture.ordinal), 12, '0'))::uuid,
         $2, fixture.id, $4
       FROM unnest($3::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)`,
      [relationPrefix, fixture.heavyPostId, fixture.urlIds.slice(1), fixture.actorId],
    )
  }
  await recomputePostHackerNewsFlags([...fixture.matchingPostIds, fixture.heavyPostId], {
    query: transaction,
  })
  await transaction.commit()
}

/** Verify exactly 1,000 matches (or none), plus the unvoted negative witness. */
export async function verifyHackerNewsScaleShape(
  fixture: HackerNewsScaleFixture,
  shape: HackerNewsScaleShape,
): Promise<{ posts: number; qualifying: number; unvoted: number }> {
  const { rows } = await read<{ posts: number; qualifying: number; heavy_matches: boolean }>(
    `/* verifyHackerNewsScaleShape */ SELECT count(*)::int AS posts,
       count(*) FILTER (WHERE has_hacker_news_references)::int AS qualifying,
       bool_or(id = $2 AND has_hacker_news_references) AS heavy_matches
     FROM posts WHERE created_by_id = $1`,
    [fixture.actorId, fixture.heavyPostId],
  )
  assert.equal(rows[0]?.posts, fixture.postCount)
  const qualifying = shape === 'zero' ? 0 : HACKER_NEWS_SCALE_MATCH_COUNT
  assert.equal(rows[0]?.qualifying, qualifying)
  assert.equal(rows[0]?.heavy_matches, false)
  const { rows: relations } = await read<{ unvoted: number; selected: number }>(
    `/* verifyHackerNewsScaleHeavyUrls */ SELECT
       (SELECT count(*)::int FROM relation__post__related__url
        WHERE subject_id = $1 AND deleted_at IS NULL AND votes_score_net = 0) AS unvoted,
       (SELECT count(*)::int FROM (${buildHackerNewsPostUrlsSql('candidate.id')}) selected) AS selected
     FROM posts candidate WHERE candidate.id = $1`,
    [fixture.heavyPostId],
  )
  const unvoted = shape === 'related' ? HACKER_NEWS_SCALE_UNVOTED_URL_COUNT : 0
  assert.equal(relations[0]?.unvoted, unvoted)
  assert.equal(relations[0]?.selected, 0)
  return { posts: fixture.postCount, qualifying, unvoted }
}

/** Leaf ANALYZE refreshes its indexes too; PostgreSQL does not ANALYZE indexes independently. */
export async function analyzeHackerNewsScaleFixture(
  fixture: HackerNewsScaleFixture,
): Promise<{ postLeaves: number; posts: number }> {
  for (const partition of fixture.partitions) {
    if (!/^posts__explain_5053_hn_[0-9]{4}_[0-9]{2}$/.test(partition.name))
      throw new Error('Unexpected HN scale partition name')
    // no-mistakes-disable-next-line query-reached-per-item: refresh the fixed 24 owned leaf statistics and their indexes before each independent shape capture.
    await write(`/* analyzeHackerNewsScaleLeaf */ ANALYZE ${partition.name}`)
  }
  const { rows: relationLeaves } = await read<{ name: string }>(
    `/* hackerNewsScaleRelationLeaves */ SELECT relid::regclass::text AS name
     FROM pg_partition_tree('relation__post__related__url'::regclass) WHERE isleaf LIMIT 101`,
  )
  if (relationLeaves.length > 100) throw new Error('HN scale relation leaf inventory exceeds 100')
  for (const leaf of relationLeaves) {
    // Catalog-derived regclass names are already quoted by PostgreSQL.
    // no-mistakes-disable-next-line query-reached-per-item: refresh the capped relation leaf inventory after changing at most 4,000 owned URL relations.
    await write(`/* analyzeHackerNewsScaleRelationLeaf */ ANALYZE ${leaf.name}`)
  }
  await write(`/* analyzeHackerNewsScaleJoins */ ANALYZE
    posts, urls, url_hacker_news_totals, relation__post__related__url,
    user_suspensions, communities, community_post_reviews, community_members,
    relation__user__follow__user, story_posts, stories, rss_feed_items,
    rss_feed_item_sources, rss_feeds`)
  return { postLeaves: fixture.partitions.length, posts: fixture.postCount }
}
