import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { paginationMaxima } from '@services/pagination/config'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { postsWorkConfig, postsWorkMaxValues } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture, seedHostnameIds, seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'

const POSTS_PER_URL = postsWorkMaxValues.max_posts_per_url
// Each primary feed item can contribute its own URL and three distinct story preview URLs.
const URL_COUNT = paginationMaxima.max_limit * 4
const RELATED_POSTS = Math.ceil(POSTS_PER_URL / 2)

type FixturePost = { id: string; url_id: string | null }

async function seedPosts(query: QueryExecutor, urlIds: string[]): Promise<FixturePost[]> {
  const hotUrlId = urlIds[0]!
  // Give one URL 51 distinct candidates across both production branches and each other URL one.
  const extraLinks = Array<string>(POSTS_PER_URL - RELATED_POSTS).fill(hotUrlId)
  const discussionInputs = Array<null>(RELATED_POSTS).fill(null)
  const { rows } = await query<FixturePost>(
    `/* seedRelatedPostUrlCapacityPosts */ INSERT INTO posts (
      created_via, post_type, title, created_by_id, url_id, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    ) SELECT 'system',
      (CASE WHEN url_id IS NULL THEN 'discussion' ELSE 'link' END)::post_types,
      'EXPLAIN related post', $2, url_id, CURRENT_TIMESTAMP, $3, $3
    FROM unnest($1::uuid[]) AS input(url_id)
    RETURNING id, url_id`,
    [[...urlIds, ...extraLinks, ...discussionInputs], seedUser.id, contentHash('related-post-cap')],
  )
  const relatedPostIds = rows.filter(post => post.url_id === null).map(post => post.id)
  await query(
    `/* seedRelatedPostUrlCapacityRelations */ INSERT INTO relation__post__related__url (
      subject_id, object_id, created_by_id, votes_score_up, votes_count_up
    ) SELECT post_id, $2, $3, 1, 1
    FROM unnest($1::uuid[]) AS input(post_id)`,
    [relatedPostIds, hotUrlId, seedUser.id],
  )
  return rows
}

async function seedFixture(): Promise<{ urlIds: string[]; posts: FixturePost[] }> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    `/* seedRelatedPostUrlCapacityUrls */ INSERT INTO urls (url, hostname_id, pathname, search_params)
    SELECT 'https://seed-host-0.example.com' || pathname, $2::uuid, pathname, '{}'::jsonb
    FROM (
      SELECT '/' || $1::text || '/' || serial AS pathname
      FROM generate_series(1, $3::int) AS input(serial)
    ) paths
    RETURNING id`,
    [`related-post-capacity-${randomUUID()}`, seedHostnameIds[0], URL_COUNT],
  )
  const urlIds = rows.map(row => row.id)
  const posts = await seedPosts(query, urlIds)
  await query.commit()
  return { urlIds, posts }
}

async function deleteFixture(urlIds: string[], posts: FixturePost[]): Promise<void> {
  await using query = await beginTransaction()
  // Deleting the owned posts also cascades to the fixture's related-URL rows.
  await query(
    `/* deleteRelatedPostUrlCapacityPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])`,
    [posts.map(post => post.id)],
  )
  await query(
    `/* deleteRelatedPostUrlCapacityUrls */ DELETE FROM urls WHERE id = ANY($1::uuid[])`,
    [urlIds],
  )
  await query.commit()
}

export async function runRelatedPostUrlCapacityScenario(): Promise<void> {
  const scenario = 'related-posts-by-url-at-cap'
  await postsWorkConfig.waitForInitialization()
  const { urlIds, posts } = await seedFixture()
  const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
    max_posts_per_url: POSTS_PER_URL,
  })
  try {
    // Refresh positive-vote selectivity so Postgres does not treat the 2 base-seeded positive
    // links as a 1-row outer loop over the 400-URL lookup.
    await write('/* analyzeRelatedPostUrlCapacity */ ANALYZE relation__post__related__url')
    const hotUrlId = urlIds[0]!
    const candidatesByUrl = Map.groupBy(posts, post => post.url_id ?? hotUrlId)
    const expected = Object.fromEntries(
      [...candidatesByUrl].map(([urlId, candidates]) => [
        urlId,
        candidates
          .map(post => post.id)
          .toSorted()
          .slice(-POSTS_PER_URL),
      ]),
    )
    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'urls', max: URL_COUNT * 2 },
        // Candidate and visibility-root lookups each visit the fixture posts once.
        { kind: 'maxProcessedRows', relation: 'posts', max: posts.length * 2 + POSTS_PER_URL * 2 },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__post__related__url',
          max: POSTS_PER_URL * 2,
        },
      ],
      crossPartition: { posts: 'The batch can match discussion and link posts across ID ranges.' },
    })
    await runAndCapture(
      scenario,
      async () => {
        const actual = await getPostIdsByUrlIds(heavyFollowUser, urlIds)
        assert.equal(Object.keys(actual).length, URL_COUNT)
        assert.equal(actual[hotUrlId]?.length, POSTS_PER_URL)
        for (const [urlId, postIds] of Object.entries(expected)) {
          assert.deepEqual(actual[urlId]?.toSorted(), postIds)
        }
      },
      undefined,
      'getPostIdsByUrlIds',
      { exactCapturedNames: ['getPostIdsByUrlIds'] },
    )
  } finally {
    restore()
    await deleteFixture(urlIds, posts)
    await write('/* analyzeRelatedPostUrlCapacityCleanup */ ANALYZE relation__post__related__url')
  }
}
