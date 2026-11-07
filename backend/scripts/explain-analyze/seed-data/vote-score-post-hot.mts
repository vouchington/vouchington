import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const HOT_POST_COUNT = 2_000

/** Provide enough net-positive posts for first-page and real continuation ranking plans. */
export async function seedVoteScorePostHotFixture(): Promise<void> {
  console.log(`Seeding net-positive vote stats for ${HOT_POST_COUNT} posts across one week...`)
  const postIds = Array.from({ length: HOT_POST_COUNT }, (_, index) =>
    seedUuid((index + 1) * 5, '05'),
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedVoteScorePostHotFixture */
     UPDATE posts
     SET votes_score_up = 2, votes_count_up = 2
     WHERE id = ANY($1::uuid[])`,
    [postIds],
  )
  await transaction(
    `/* seedVoteScorePostHotFixture:follows */
     INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id)
     SELECT DISTINCT $1::uuid, posts.created_by_id, $1::uuid
     FROM posts
     WHERE posts.id = ANY($2::uuid[]) AND posts.created_by_id <> $1::uuid
     ON CONFLICT (subject_id, object_id) DO NOTHING`,
    [seedUuid(0, '01'), postIds],
  )
  await transaction(
    `/* seedVoteScorePostHotFixture:analyze */
     ANALYZE posts, relation__user__follow__user, users`,
  )
  await transaction.commit()
}
