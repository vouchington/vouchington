import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const LARGE_RATING_TOPIC_ID = seedUuid(2399, '04')

/** Distinct reviewers: ordinary review posts (index 3k+1) are authored by distinct users. */
export const LARGE_RATING_TOPIC_REVIEWERS = 6_000
/** Reviewers who wrote a second, newer review of the topic (the latest per author counts). */
const REPEAT_REVIEWERS = 1_000
/** Voters who also reviewed, and voters who only voted. */
const OVERLAPPING_VOTERS = 3_000
const VOTE_ONLY_VOTERS = 3_000
/** Overlapping voters who later changed their vote (ballot history keeps both events). */
const REVOTERS = 1_500

/**
 * Rows for other topics. Without them the popular topic is a fifth to a half of these small
 * partitions and the planner legitimately seq scans them; with them its topic_id index wins, as
 * it does in a production table where one topic is a small share of all ratings and ballots.
 */
const FILLER_RATED_TOPICS = 2
const FILLER_REVIEW_POSTS = 40_000
const FILLER_VOTED_TOPICS = 100
const FILLER_VOTERS = 600

export const LARGE_RATING_TOPIC_REVIEW_ROWS =
  LARGE_RATING_TOPIC_REVIEWERS + REPEAT_REVIEWERS + FILLER_RATED_TOPICS * FILLER_REVIEW_POSTS
export const LARGE_RATING_TOPIC_VOTE_ROWS =
  OVERLAPPING_VOTERS + VOTE_ONLY_VOTERS + REVOTERS + FILLER_VOTED_TOPICS * FILLER_VOTERS

// A popular topic: thousands of reviewers and voters, with ballot history. Ordinary seed authors
// are `index % 20_000`, so review post 3k+1 has a distinct author and review post 60_001+3k repeats it.
export async function seedLargeRatingTopic(): Promise<void> {
  const reviewPostIds = Array.from({ length: LARGE_RATING_TOPIC_REVIEWERS }, (_, k) =>
    seedUuid(3 * k + 1, '05'),
  )
  const repeatPostIds = Array.from({ length: REPEAT_REVIEWERS }, (_, k) =>
    seedUuid(60_001 + 3 * k, '05'),
  )
  const overlappingVoterIds = Array.from({ length: OVERLAPPING_VOTERS }, (_, k) =>
    seedUuid(3 * k + 1, '01'),
  )
  const voteOnlyVoterIds = Array.from({ length: VOTE_ONLY_VOTERS }, (_, k) =>
    seedUuid(3 * k + 2, '01'),
  )

  await using transaction = await beginTransaction()
  for (const [postIds, ratingOffset] of [
    [reviewPostIds, 0],
    [repeatPostIds, 2],
  ] as const) {
    await transaction(
      `/* seedLargeRatingTopic */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
       SELECT input.post_id, $2, ((input.ordinal + $3) % 5)::smallint + 1
       FROM unnest($1::uuid[]) WITH ORDINALITY AS input(post_id, ordinal)
       JOIN posts ON posts.id = input.post_id
       ON CONFLICT DO NOTHING`,
      [postIds, LARGE_RATING_TOPIC_ID, ratingOffset],
    )
  }
  // Ballots are append-only, so a rerun against the same database must not double them.
  const { rowCount: existingBallots } = await transaction(
    `/* seedLargeRatingTopic */ SELECT 1 FROM topic_votes WHERE topic_id = $1 OFFSET $2 LIMIT 1`,
    [LARGE_RATING_TOPIC_ID, OVERLAPPING_VOTERS],
  )
  if (existingBallots === 0) await seedBallots()
  await transaction(
    `/* seedLargeRatingTopic */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
     SELECT post.id, topic.id, 3
     FROM (SELECT id FROM posts WHERE post_type = 'review' ORDER BY id LIMIT $2) post
     CROSS JOIN (SELECT id FROM topics WHERE id <> $1 ORDER BY id LIMIT $3 OFFSET 50) topic
     ON CONFLICT DO NOTHING`,
    [LARGE_RATING_TOPIC_ID, FILLER_REVIEW_POSTS, FILLER_RATED_TOPICS],
  )
  const { rowCount: existingFiller } = await transaction(
    `/* seedLargeRatingTopic */ SELECT 1 FROM topic_votes
     WHERE topic_id = (SELECT id FROM topics WHERE id <> $1 ORDER BY id LIMIT 1 OFFSET 200)
     OFFSET $2 LIMIT 1`,
    [LARGE_RATING_TOPIC_ID, FILLER_VOTERS - 1],
  )
  if (existingFiller === 0)
    await transaction(
      `/* seedLargeRatingTopic */ INSERT INTO topic_votes (topic_id, user_id, score)
       SELECT topic.id, voter.id, 1
       FROM (SELECT id FROM topics WHERE id <> $1 ORDER BY id LIMIT $3 OFFSET 200) topic
       CROSS JOIN (SELECT id FROM users ORDER BY id LIMIT $2) voter`,
      [LARGE_RATING_TOPIC_ID, FILLER_VOTERS, FILLER_VOTED_TOPICS],
    )
  await transaction.commit()

  await write(
    `/* seedLargeRatingTopic */ ANALYZE post_review_topic_ratings, topic_votes, users, posts`,
  )

  async function seedBallots(): Promise<void> {
    await transaction(
      `/* seedLargeRatingTopic */ INSERT INTO topic_votes (topic_id, user_id, score)
     SELECT $2, input.user_id, CASE input.ordinal % 3 WHEN 0 THEN 1 WHEN 1 THEN -1 ELSE 0 END
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(user_id, ordinal)
     JOIN users ON users.id = input.user_id`,
      [[...overlappingVoterIds, ...voteOnlyVoterIds], LARGE_RATING_TOPIC_ID],
    )
    // A second statement gets later uuidv7 ids, so these ballots supersede the first ones.
    await transaction(
      `/* seedLargeRatingTopic */ INSERT INTO topic_votes (topic_id, user_id, score)
     SELECT $2, input.user_id, 1
     FROM unnest($1::uuid[]) AS input(user_id)
     JOIN users ON users.id = input.user_id`,
      [overlappingVoterIds.slice(0, REVOTERS), LARGE_RATING_TOPIC_ID],
    )
  }
}
