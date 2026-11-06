import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { referralBenchmarkUrlId } from './referral-links-benchmark-urls.mts'

const FIRST_AUTHOR_INDEX = 100

// The out-of-network list ranks every active link in a program, and `user_contributions` and
// `user_reviews` read the posts of every one of those authors. One program with one link hides
// that cost, so the seeded program gets many authors who already own seeded posts (post `i` is
// authored by user `i`, and its type is `i % 3`: discussion, review, data point), each with their
// own url row, and their reviews and data points are tied to the program topic so the ranking
// counts them.
export async function seedLargeReferralProgram(
  referralProgramId: string,
  authorCount = 3000,
): Promise<void> {
  console.log(`Seeding ${authorCount} authors with referral links and ranked posts...`)
  const authors = Array.from({ length: authorCount }, (_, i) => FIRST_AUTHOR_INDEX + i)
  const userIds = authors.map(index => seedUuid(index, '01'))
  const urlIds = authors.map((_, i) => referralBenchmarkUrlId(i))
  const reviewPostIds = authors.filter(index => index % 3 === 1).map(index => seedUuid(index, '05'))
  const dataPointPostIds = authors
    .filter(index => index % 3 === 2)
    .map(index => seedUuid(index, '05'))

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO user_referral_program_links
       (user_id, referral_program_topic_id, url_id, label, created_via)
     SELECT author, $1, url, 'Seed program link', 'system'
     FROM unnest($2::uuid[], $3::uuid[]) AS t(author, url)
     ON CONFLICT DO NOTHING`,
    [referralProgramId, userIds, urlIds],
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
     SELECT post, $1, 4 FROM unnest($2::uuid[]) AS t(post) ON CONFLICT DO NOTHING`,
    [referralProgramId, reviewPostIds],
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO post_data_point_topics (post_id, topic_id, order_index)
     SELECT post, $1, 0 FROM unnest($2::uuid[]) AS t(post) ON CONFLICT DO NOTHING`,
    [referralProgramId, dataPointPostIds],
  )
  await transaction.commit()
}
