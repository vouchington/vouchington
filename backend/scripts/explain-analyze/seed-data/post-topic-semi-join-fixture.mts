import { beginTransaction } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import { seedUuid } from './common.mts'
import { getPostFeedIds } from '../run-services.mts'
import { seedUser } from '../run-support.mts'

const ALIASES_PER_TOPIC = 300
const SPARSE_POST_COUNT = 5
const MIN_NEWEST_POST_COHORT_SIZE = 10_000
const FIXTURE_ID_START = 800_000

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
  const newestPostCohortSize = Math.max(
    MIN_NEWEST_POST_COHORT_SIZE,
    getPostsWorkLimit('post_search_filter_candidate_limit') * 2,
  )

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
    SELECT posts.id FROM posts
    WHERE posts.root_post_id IS NULL
      AND posts.post_type != 'comment'
      AND `
    .append(buildPublicPostEligibilityFilter('posts', 'posts'))
    .append(sql` ORDER BY posts.id DESC LIMIT ${newestPostCohortSize}`)
  const { rows: newestPosts } = await transaction<{ id: string }>(newestPostsQuery)
  if (newestPosts.length !== newestPostCohortSize)
    throw new Error('Post topic fixture needs enough eligible newest posts for both raw windows')

  const feedPostId = (await getPostFeedIds(seedUser, { time_range: '1w', limit: 1 })).results[0]
    ?.entity_id
  if (!feedPostId) throw new Error('Post topic fixture requires an existing feed delivery witness')
  const sparsePostIds = newestPosts.slice(0, SPARSE_POST_COUNT).map(post => post.id)
  const sparseAliasIds = fixture.sparseAliasIds.slice(0, SPARSE_POST_COUNT)
  await transaction(
    `/* seedPostTopicSemiJoinFixture:sparse-memberships */
     INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT membership.post_id, membership.alias_id, $3::uuid, 1
     FROM UNNEST($1::uuid[], $2::uuid[]) AS membership(post_id, alias_id)
     ON CONFLICT DO NOTHING`,
    [sparsePostIds, sparseAliasIds, seedUuid(0, '01')],
  )

  const densePostIds = newestPosts.map(post => post.id)
  const denseAliasIds = newestPosts.map(
    (_, index) => fixture.denseAliasIds[index % ALIASES_PER_TOPIC]!,
  )
  await transaction(
    `/* seedPostTopicSemiJoinFixture:dense-memberships */
     INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up)
     SELECT membership.post_id, membership.alias_id, $3::uuid, 1
     FROM UNNEST($1::uuid[], $2::uuid[]) AS membership(post_id, alias_id)
     ON CONFLICT DO NOTHING`,
    [densePostIds, denseAliasIds, seedUuid(0, '01')],
  )
  // Reuse an actual feed delivery rather than assuming a seeded author/post remains
  // eligible after earlier scenarios. Only this fixture owns the two added memberships.
  await transaction(
    `/* seedPostTopicSemiJoinFixture:feed-topic-membership */
     INSERT INTO relation__post__category__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT $1::uuid, topic.topic_id, $2::uuid, 1, 1
     FROM UNNEST($3::uuid[]) AS topic(topic_id)
     ON CONFLICT DO NOTHING`,
    [feedPostId, seedUuid(0, '01'), topicIds],
  )
  await transaction(
    '/* seedPostTopicSemiJoinFixture:analyze */ ANALYZE topic_aliases, relation__post__category__topic_alias, posts',
  )
  await transaction.commit()
}

/** Delete only this fixture's relation, aliases, and topic rows after late EXPLAIN captures. */
export async function cleanupPostTopicSemiJoinFixture(): Promise<void> {
  const fixture = POST_TOPIC_SEMI_JOIN_FIXTURE
  const aliasIds = [...fixture.sparseAliasIds, ...fixture.denseAliasIds]
  const topicIds = [fixture.sparseTopicId, fixture.denseTopicId]

  await using transaction = await beginTransaction()
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:relations */ DELETE FROM relation__post__category__topic_alias WHERE object_id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:feed-topic-relation */ DELETE FROM relation__post__category__topic WHERE object_id = ANY($1::uuid[])',
    [topicIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:aliases */ DELETE FROM topic_aliases WHERE id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupPostTopicSemiJoinFixture:topics */ DELETE FROM topics WHERE id = ANY($1::uuid[])',
    [topicIds],
  )
  await transaction.commit()
}
