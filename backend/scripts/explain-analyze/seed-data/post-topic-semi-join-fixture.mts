import { beginTransaction } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import sql from 'sql-template-strings'
import { seedUuid } from './common.mts'
import {
  POST_TOPIC_OWNED_IDS,
  POST_TOPIC_FEED_POST_ID,
  POST_TOPIC_FEED_RELATION_IDS,
  seedPostTopicOwnedPosts,
} from './post-topic-owned-posts.mts'

const ALIASES_PER_TOPIC = 40
const SPARSE_POST_COUNT = 5
const MIN_NEWEST_POST_COHORT_SIZE = 10_000
const FIXTURE_ID_START = 800_000
const SEED_VIEWER_ID = seedUuid(0, '01')

export const POST_TOPIC_SEMI_JOIN_FIXTURE = {
  sparseTopicId: seedUuid(FIXTURE_ID_START, 'e2'),
  denseTopicId: seedUuid(FIXTURE_ID_START + 1, 'e2'),
  sparseAliasIds: Array.from({ length: ALIASES_PER_TOPIC }, (_, index) =>
    seedUuid(FIXTURE_ID_START + index, 'e3'),
  ),
  denseAliasIds: Array.from({ length: ALIASES_PER_TOPIC }, (_, index) =>
    seedUuid(FIXTURE_ID_START + ALIASES_PER_TOPIC + index, 'e3'),
  ),
} as const

export async function seedPostTopicSemiJoinFixture(): Promise<void> {
  const fixture = POST_TOPIC_SEMI_JOIN_FIXTURE
  const topicIds = [fixture.sparseTopicId, fixture.denseTopicId]
  const aliasIds = [...fixture.sparseAliasIds, ...fixture.denseAliasIds]
  const topicNames = ['Post semi-join sparse', 'Post semi-join dense']
  const topicSlugs = ['post-semi-join-sparse', 'post-semi-join-dense']
  const aliasTopicIds = [
    ...fixture.sparseAliasIds.map(() => fixture.sparseTopicId),
    ...fixture.denseAliasIds.map(() => fixture.denseTopicId),
  ]
  const aliasNames = [
    ...fixture.sparseAliasIds.map((_, index) => `post-semi-join-sparse-${index}`),
    ...fixture.denseAliasIds.map((_, index) => `post-semi-join-dense-${index}`),
  ]

  await seedPostTopicOwnedPosts()
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedPostTopicSemiJoinFixture:topics */
     INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     SELECT topic.id, topic.name, topic.slug, 'system', decode(repeat('00', 32), 'hex')
     FROM UNNEST($1::uuid[], $2::text[], $3::text[]) AS topic(id, name, slug)
     ON CONFLICT DO NOTHING`,
    [topicIds, topicNames, topicSlugs],
  )
  await transaction(
    `/* seedPostTopicSemiJoinFixture:aliases */
     INSERT INTO topic_aliases (id, topic_id, alias)
     SELECT alias.id, alias.topic_id, alias.alias
     FROM UNNEST($1::uuid[], $2::uuid[], $3::text[]) AS alias(id, topic_id, alias)
     ON CONFLICT DO NOTHING`,
    [aliasIds, aliasTopicIds, aliasNames],
  )

  const newestPostsQuery = sql`/* seedPostTopicSemiJoinFixture:newest-posts */
    WITH newest_posts AS MATERIALIZED (
      SELECT posts.id FROM posts
      WHERE posts.deleted_at IS NULL
        AND posts.id >= ${getMinUUIDv7ForDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))}::uuid
      ORDER BY posts.id DESC
      LIMIT ${MIN_NEWEST_POST_COHORT_SIZE}
    )
    SELECT posts.id, posts.created_by_id
    FROM newest_posts JOIN posts ON posts.id = newest_posts.id
    WHERE posts.root_post_id IS NULL
      AND posts.id <> ${POST_TOPIC_FEED_POST_ID}::uuid
      AND posts.post_type = 'discussion'
      AND posts.community_id IS NULL
      AND `
    .append(buildPublicPostEligibilityFilter('posts', 'posts'))
    .append(sql` ORDER BY posts.id DESC`)
  const { rows: newestPosts } = await transaction<{ id: string }>(newestPostsQuery)
  if (newestPosts.length < SPARSE_POST_COUNT + 1)
    throw new Error(
      'Post topic fixture needs recent public discussion posts inside the raw feed window',
    )

  const sparsePostIds = POST_TOPIC_OWNED_IDS.slice(-SPARSE_POST_COUNT).toReversed()
  const sparseAliasIds = fixture.sparseAliasIds.slice(0, SPARSE_POST_COUNT)
  await transaction(
    `/* seedPostTopicSemiJoinFixture:sparse-memberships */
     INSERT INTO relation__post__category__topic_alias
       (id, subject_id, object_id, created_by_id, votes_score_up)
     SELECT uuidv7(GREATEST(uuid_extract_timestamp(membership.post_id) - clock_timestamp() + interval '1 second', interval '0 seconds')), membership.post_id, membership.alias_id, $3::uuid, 1
     FROM UNNEST($1::uuid[], $2::uuid[]) AS membership(post_id, alias_id)
     ON CONFLICT DO NOTHING`,
    [sparsePostIds, sparseAliasIds, seedUuid(0, '01')],
  )

  const densePostIds = [
    ...new Set([...POST_TOPIC_OWNED_IDS.slice(1), ...newestPosts.map(post => post.id)]),
  ]
  const denseAliasIds = densePostIds.map(
    (_, index) => fixture.denseAliasIds[index % ALIASES_PER_TOPIC]!,
  )
  await transaction(
    `/* seedPostTopicSemiJoinFixture:dense-memberships */
     INSERT INTO relation__post__category__topic_alias
       (id, subject_id, object_id, created_by_id, votes_score_up)
     SELECT uuidv7(GREATEST(uuid_extract_timestamp(membership.post_id) - clock_timestamp() + interval '1 second', interval '0 seconds')), membership.post_id, membership.alias_id, $3::uuid, 1
     FROM UNNEST($1::uuid[], $2::uuid[]) AS membership(post_id, alias_id)
     ON CONFLICT DO NOTHING`,
    [densePostIds, denseAliasIds, seedUuid(0, '01')],
  )
  const feedCap = getPostsWorkLimit('feed_inspected_row_cap')
  const lowerCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const { rows: sharedDeliveries } = await transaction<{ count: number }>(
    `/* seedPostTopicSemiJoinFixture:shared-delivery-count */
     SELECT count(*)::int AS count FROM (
       SELECT 1 FROM post_feed_shares
       WHERE recipient_user_id = $1::uuid AND shared_by_id IS NOT NULL AND sort_at >= $2
       LIMIT $3
     ) shares`,
    [SEED_VIEWER_ID, lowerCutoff, feedCap],
  )
  const sharedDeliveryCount = sharedDeliveries[0]?.count ?? 0
  if (sharedDeliveryCount >= feedCap)
    throw new Error('Post topic fixture needs room for a direct row in the capped feed prefix')
  const rawDirectPrefix = feedCap - sharedDeliveryCount
  const firstRawDirectCandidates = sql`/* seedPostTopicSemiJoinFixture:feed-prefix-witness */
    WITH raw_direct_prefix AS MATERIALIZED (
      SELECT posts.id FROM posts
      WHERE posts.deleted_at IS NULL
        AND posts.id >= ${getMinUUIDv7ForDate(lowerCutoff)}::uuid
      ORDER BY posts.id DESC
      LIMIT ${rawDirectPrefix}
    )
    SELECT posts.id FROM raw_direct_prefix
    JOIN posts ON posts.id = raw_direct_prefix.id
    WHERE posts.id = ${POST_TOPIC_FEED_POST_ID}::uuid
      AND posts.root_post_id IS NULL AND posts.post_type = 'discussion'
      AND posts.community_id IS NULL
      AND `
    .append(buildPublicPostEligibilityFilter('posts', 'posts'))
    .append(sql` ORDER BY posts.id DESC LIMIT 1`)
  const { rows: feedEligiblePosts } = await transaction<{ id: string }>(firstRawDirectCandidates)
  const feedPostId = feedEligiblePosts[0]?.id
  if (!feedPostId)
    throw new Error('Post topic fixture could not find a public post inside the capped feed prefix')

  await transaction(
    `/* seedPostTopicSemiJoinFixture:feed-topic-membership-witness */
     INSERT INTO relation__post__category__topic
       (id, subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT topic.relation_id, $1::uuid, topic.topic_id, $2::uuid, 1, 1
     FROM UNNEST($3::uuid[], $4::uuid[]) AS topic(topic_id, relation_id)
     ON CONFLICT DO NOTHING`,
    [feedPostId, SEED_VIEWER_ID, topicIds, POST_TOPIC_FEED_RELATION_IDS],
  )
  await transaction(
    `/* seedPostTopicSemiJoinFixture:viewer-topic-follows */
     INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id)
     SELECT $1::uuid, topic.topic_id, $1::uuid
     FROM UNNEST($2::uuid[]) AS topic(topic_id)
     ON CONFLICT DO NOTHING`,
    [SEED_VIEWER_ID, topicIds],
  )
  await transaction(
    '/* seedPostTopicSemiJoinFixture:analyze */ ANALYZE topic_aliases, relation__post__category__topic_alias, posts',
  )
  await transaction.commit()
}
