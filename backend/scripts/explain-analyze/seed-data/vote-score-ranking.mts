import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const HOSTNAME_FIXTURE_COUNT = 500_000
const HOSTNAME_SEED_BATCH_SIZE = 5_000
const VOTED_HOSTNAME_COUNT = 5_000
const PUBLISHER_RELATION_FIXTURE_COUNT = 200_000

/** Seed the publisher and post projection corpus before the separate hostname burst. */
export async function seedVoteScorePublisherAndPostFixture(): Promise<void> {
  console.log('Seeding 200k publisher relations and post related-topic rows...')
  const seedPostId = seedUuid(0, '05')
  const seedTopicId = seedUuid(0, '04')
  const seedUserId = seedUuid(0, '01')
  await using transaction = await beginTransaction()
  const query = transaction

  await query(
    `/* seedVoteScoreRankingFixture:publisher-relations */
     INSERT INTO relation__topic__publisher_type__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT
       ('019e0000-0400-7000-8000-' || lpad(to_hex(10 + ((row_number - 1) / 100)), 12, '0'))::uuid,
       ('019e0000-0400-7000-8000-' || lpad(to_hex(2200 + ((row_number - 1) % 100)), 12, '0'))::uuid,
       $1::uuid,
       1,
       1
     FROM generate_series(1, $2::integer) AS rows(row_number)
     ON CONFLICT (subject_id, object_id) DO NOTHING`,
    [seedUserId, PUBLISHER_RELATION_FIXTURE_COUNT],
  )
  const { rows: publisherTopics } = await query<{ id: string }>(
    `/* seedVoteScoreRankingFixture:publisher-topic */
     SELECT id FROM topics WHERE slug = 'blog' AND deleted_at IS NULL LIMIT 1`,
  )
  const blogTopicId = publisherTopics[0]?.id
  if (!blogTopicId) throw new Error('The seeded blog publisher type topic is required')
  await query(
    `/* seedVoteScoreRankingFixture:publisher-candidates */
     INSERT INTO relation__topic__publisher_type__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     VALUES ($1, $2, $3, 10, 10), ($4, $5, $3, 1, 1), ($6, $7, $3, 10, 10)
     ON CONFLICT (subject_id, object_id) DO UPDATE
       SET votes_score_up = EXCLUDED.votes_score_up,
           votes_count_up = EXCLUDED.votes_count_up`,
    [
      seedUuid(1, '04'),
      seedTopicId,
      seedUserId,
      seedUuid(2, '04'),
      seedUuid(1, '04'),
      seedUuid(10, '04'),
      blogTopicId,
    ],
  )
  await query(
    `/* seedVoteScoreRankingFixture:muted-publisher-type */
     INSERT INTO relation__user__mute__topic (subject_id, object_id, created_by_id)
     VALUES ($1, $2, $1)
     ON CONFLICT (subject_id, object_id) DO NOTHING`,
    [seedUserId, seedTopicId],
  )

  const relatedTopicIds = Array.from({ length: 12 }, (_, index) => seedUuid(2_488 + index, '04'))
  await query(
    `/* seedVoteScoreRankingFixture:post-related-topics */
     INSERT INTO relation__post__category__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT $1::uuid, topic_id, $2::uuid, 1, 1
     FROM unnest($3::uuid[]) AS topics(topic_id)
     ON CONFLICT (subject_id, object_id) DO NOTHING`,
    [seedPostId, seedUserId, relatedTopicIds],
  )

  await query(
    `/* seedVoteScoreRankingFixture:analyze-publisher-and-post */
     ANALYZE relation__topic__publisher_type__topic, relation__post__category__topic`,
  )
  await transaction.commit()
}

/** Add the hostname burst after publisher and viewer eligibility plans have been captured. */
export async function seedVoteScoreHostnameFixture(): Promise<void> {
  console.log('Seeding 500k hostname ranking rows...')
  const seedTopicId = seedUuid(0, '04')
  const seedParentTopicId = seedUuid(500, '04')
  await using transaction = await beginTransaction()
  const query = transaction
  // Active-topic triggers run for every row; bound each statement while preserving the full corpus.
  for (let first = 1; first <= HOSTNAME_FIXTURE_COUNT; first += HOSTNAME_SEED_BATCH_SIZE) {
    const last = Math.min(first + HOSTNAME_SEED_BATCH_SIZE - 1, HOSTNAME_FIXTURE_COUNT)
    await query(
      `/* seedVoteScoreHostnameFixture */
     INSERT INTO url_hostnames
       (id, hostname, publicly_introduced_at, topic_id, votes_score_up, votes_count_up)
     SELECT
       ('019e0000-0200-7000-8000-' || lpad(to_hex(2000000 + row_number), 12, '0'))::uuid,
       'vote-score-plan-' || row_number || '.example.com',
       CURRENT_TIMESTAMP,
       CASE WHEN row_number <= $1 THEN $2::uuid ELSE $3::uuid END,
       CASE WHEN row_number <= $1 THEN 1 ELSE 0 END,
       CASE WHEN row_number <= $1 THEN 1 ELSE 0 END
     FROM generate_series($4::integer, $5::integer) AS rows(row_number)
     ON CONFLICT DO NOTHING`,
      [VOTED_HOSTNAME_COUNT, seedTopicId, seedParentTopicId, first, last],
    )
  }
  await query(`/* seedVoteScoreHostnameFixture:analyze */ ANALYZE url_hostnames`)
  await transaction.commit()
}
