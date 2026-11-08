import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const DATA_POINT_TOPIC_BEST_ID = seedUuid(900_000, 'ee')
export const DATA_POINT_TOPIC_BEST_SECOND_ID = seedUuid(900_001, 'ee')
const DATA_POINT_TOPIC_BEST_PADDING_ID = seedUuid(900_002, 'ee')

const POST_INDEX_START = 30_002
export const DATA_POINT_TOPIC_BEST_COUNT = 20_005
const PADDING_POST_INDEX_START = 40_001
const PADDING_POST_COUNT = 20_000

function cohortPostIds(): string[] {
  return Array.from({ length: DATA_POINT_TOPIC_BEST_COUNT }, (_, index) =>
    seedUuid(POST_INDEX_START + index * 3, '05'),
  )
}

function paddingPostIds(): string[] {
  return Array.from({ length: PADDING_POST_COUNT }, (_, index) =>
    seedUuid(PADDING_POST_INDEX_START + index * 3, '05'),
  )
}

/** Link an existing data-point range to a topic cohort that crosses the default 1,000-row cap. */
export async function seedDataPointTopicBestCohort(): Promise<void> {
  const postIds = cohortPostIds()
  const sparsePostIds = [postIds[10]!, postIds[500]!, postIds[1_001]!, postIds[1_204]!]
  const backgroundPostIds = paddingPostIds()
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedDataPointTopicBestCohort:topics */ INSERT INTO topics (
       id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     VALUES ($1, 'EXPLAIN topic-best cohort', 'explain-topic-best-cohort', 'system',
       decode(repeat('ab', 32), 'hex')),
       ($2, 'EXPLAIN topic-best cohort sparse filter', 'explain-topic-best-cohort-sparse',
        'system', decode(repeat('ab', 32), 'hex')),
       ($3, 'EXPLAIN topic-best cohort padding', 'explain-topic-best-cohort-padding',
        'system', decode(repeat('ab', 32), 'hex'))`,
    [DATA_POINT_TOPIC_BEST_ID, DATA_POINT_TOPIC_BEST_SECOND_ID, DATA_POINT_TOPIC_BEST_PADDING_ID],
  )
  await transaction(
    `/* seedDataPointTopicBestCohort:primary */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT post_id, $2::uuid FROM UNNEST($1::uuid[]) AS seed(post_id)`,
    [postIds, DATA_POINT_TOPIC_BEST_ID],
  )
  await transaction(
    `/* seedDataPointTopicBestCohort:sparse */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT post_id, $2::uuid FROM UNNEST($1::uuid[]) AS seed(post_id)`,
    [sparsePostIds, DATA_POINT_TOPIC_BEST_SECOND_ID],
  )
  await transaction(
    `/* seedDataPointTopicBestCohort:padding */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT post_id, $2::uuid FROM UNNEST($1::uuid[]) AS seed(post_id)`,
    [backgroundPostIds, DATA_POINT_TOPIC_BEST_PADDING_ID],
  )
  await transaction(
    '/* seedDataPointTopicBestCohort:analyze */ ANALYZE posts, post_data_point_topics',
  )
  await transaction.commit()
}

export async function deleteDataPointTopicBestCohort(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* deleteDataPointTopicBestCohort:links */ DELETE FROM post_data_point_topics
     WHERE topic_id = ANY($1::uuid[])`,
    [[DATA_POINT_TOPIC_BEST_ID, DATA_POINT_TOPIC_BEST_SECOND_ID, DATA_POINT_TOPIC_BEST_PADDING_ID]],
  )
  await transaction(
    `/* deleteDataPointTopicBestCohort:topics */ DELETE FROM topics WHERE id = ANY($1::uuid[])`,
    [[DATA_POINT_TOPIC_BEST_ID, DATA_POINT_TOPIC_BEST_SECOND_ID, DATA_POINT_TOPIC_BEST_PADDING_ID]],
  )
  await transaction.commit()
}
