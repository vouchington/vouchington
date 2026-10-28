import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const DENSE_TOPIC_VIEWER_TOPIC_ID = seedUuid(2400, '04')

const DIRECT_DISCUSSIONS = 100
const ALIAS_DISCUSSIONS = 100
const UNRELATED_ALIAS_RELATIONS = 10_000
const NONPOSITIVE_TOPIC_RELATIONS = 20_000
const REVIEWS = 600
const DATA_POINTS = 600

export const DENSE_TOPIC_VIEWER_COUNTS = {
  discussions: DIRECT_DISCUSSIONS + ALIAS_DISCUSSIONS,
  reviews: REVIEWS,
  'data-points': DATA_POINTS,
} as const

// Topic 2400 has no positively voted direct/alias post relation or review/data-point attachment
// in the ordinary seed. These older seeded posts are outside its existing relation range and the
// top-hashtag fixture, so this scenario can exercise substantial matches without changing the
// anchor topic's one-discussion assertion or the preceding plan captures.
export async function seedDenseTopicViewerCounts(): Promise<void> {
  const directPostIds = Array.from({ length: DIRECT_DISCUSSIONS }, (_, i) =>
    seedUuid(50_001 + i * 3, '05'),
  )
  const aliasPostIds = Array.from({ length: ALIAS_DISCUSSIONS }, (_, i) =>
    seedUuid(60_000 + i * 3, '05'),
  )
  const reviewPostIds = Array.from({ length: REVIEWS }, (_, i) => seedUuid(70_000 + i * 3, '05'))
  const unrelatedAliasPostIds = Array.from({ length: UNRELATED_ALIAS_RELATIONS }, (_, i) =>
    seedUuid(85_000 + i, '05'),
  )
  const ordinaryRelationPostIds = Array.from({ length: 50_000 }, (_, i) => seedUuid(i, '05'))
  const nonpositiveDirectPostIds = Array.from({ length: NONPOSITIVE_TOPIC_RELATIONS }, (_, i) =>
    seedUuid(52_000 + i, '05'),
  )
  const nonpositiveAliasPostIds = Array.from({ length: NONPOSITIVE_TOPIC_RELATIONS }, (_, i) =>
    seedUuid(72_000 + i, '05'),
  )
  const dataPointPostIds = Array.from({ length: DATA_POINTS }, (_, i) =>
    seedUuid(80_000 + i * 3, '05'),
  )

  await using transaction = await beginTransaction()
  const { rows: aliases } = await transaction<{ id: string }>(
    `/* seedDenseTopicViewerCounts */ SELECT id FROM topic_aliases
     WHERE topic_id = $1 AND alias = 'seed-alias-2400'`,
    [DENSE_TOPIC_VIEWER_TOPIC_ID],
  )
  const aliasId = aliases[0]?.id
  if (!aliasId) throw new Error('Dense topic viewer counts seed requires seed-alias-2400')

  // The sparse fixture's BitmapAnd plan scans the global positive-score index to find one
  // topic row. Grow that index using only the original 50,000 seeded relations, without adding
  // any positive row to the anchor or dense topic or modifying unrelated development rows.
  await transaction(
    `/* seedDenseTopicViewerCounts */ UPDATE relation__post__category__topic
     SET votes_score_up = 1, votes_count_up = 1
     WHERE object_id <> $1 AND object_id <> $2 AND votes_score_up = 0
       AND subject_id = ANY($3::uuid[])`,
    [DENSE_TOPIC_VIEWER_TOPIC_ID, seedUuid(0, '04'), ordinaryRelationPostIds],
  )

  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO relation__post__category__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT p.id, $2, p.created_by_id, 1, 1 FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [directPostIds, DENSE_TOPIC_VIEWER_TOPIC_ID],
  )
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO relation__post__category__topic
       (subject_id, object_id, created_by_id)
     SELECT p.id, $2, p.created_by_id FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [nonpositiveDirectPostIds, DENSE_TOPIC_VIEWER_TOPIC_ID],
  )
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT p.id, $2, p.created_by_id, 1, 1 FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [aliasPostIds, aliasId],
  )
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id)
     SELECT p.id, $2, p.created_by_id FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [nonpositiveAliasPostIds, aliasId],
  )
  // The ordinary alias corpus has only 361 relations, for which a full scan is cheap. Add
  // unrelated positive relations so the topic alias lookup must remain selective as it grows.
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT p.id, alias.id, p.created_by_id, 1, 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS seeded(post_id, ordinal)
     JOIN posts p ON p.id = seeded.post_id
     JOIN topic_aliases alias
       ON alias.alias = 'seed-alias-' || ((seeded.ordinal - 1) % 2400)::text
     ON CONFLICT DO NOTHING`,
    [unrelatedAliasPostIds],
  )
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
     SELECT p.id, $2, 5 FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [reviewPostIds, DENSE_TOPIC_VIEWER_TOPIC_ID],
  )
  await transaction(
    `/* seedDenseTopicViewerCounts */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT p.id, $2 FROM posts p WHERE p.id = ANY($1::uuid[])
     ON CONFLICT DO NOTHING`,
    [dataPointPostIds, DENSE_TOPIC_VIEWER_TOPIC_ID],
  )
  await transaction.commit()

  // The fixture is added after the ordinary seed's VACUUM ANALYZE. Give the first capture the
  // same accurate cardinality estimates as the second capture's stability pass.
  await write(
    `/* seedDenseTopicViewerCounts */ ANALYZE relation__post__category__topic,
      relation__post__category__topic_alias, post_review_topic_ratings, post_data_point_topics`,
  )
}
