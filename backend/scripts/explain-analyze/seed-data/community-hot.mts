import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { TRENDING_CANDIDATE_POST_INDEX_OFFSET } from './trending-communities.mts'

const FIRST_APPROVED_POST_INDEX = 15
const APPROVED_POST_STRIDE = 5
const APPROVED_HOT_POST_COUNT = 100

type CommunityHotPostStats = Readonly<{
  postId: string
  votesScoreUp: number
  votesScoreDown: number
  votesCountUp: number
  votesCountDown: number
}>

function communityHotPostStats(): CommunityHotPostStats[] {
  return Array.from({ length: APPROVED_HOT_POST_COUNT }, (_, index) => {
    const postIndex = FIRST_APPROVED_POST_INDEX + index * APPROVED_POST_STRIDE
    const [votesScoreUp, votesScoreDown, votesCountUp, votesCountDown] =
      index < 20 ? [20, 0, 20, 0] : index < 30 ? [100, 90, 100, 90] : [1.001, 0.999, 1, 1]
    return {
      postId: seedUuid(TRENDING_CANDIDATE_POST_INDEX_OFFSET + postIndex, '05'),
      votesScoreUp,
      votesScoreDown,
      votesCountUp,
      votesCountDown,
    }
  })
}

/** Make existing approved trending-community posts net-positive with varied vote confidence. */
export async function seedCommunityHotPosts(): Promise<void> {
  const rows = communityHotPostStats()
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCommunityHotPosts */
     UPDATE posts AS p
     SET votes_score_up = seeded.votes_score_up,
         votes_score_down = seeded.votes_score_down,
         votes_count_up = seeded.votes_count_up,
         votes_count_down = seeded.votes_count_down
    FROM unnest($1::uuid[], $2::double precision[], $3::double precision[], $4::integer[], $5::integer[])
       AS seeded(post_id, votes_score_up, votes_score_down, votes_count_up, votes_count_down)
     WHERE p.id = seeded.post_id`,
    [
      rows.map(row => row.postId),
      rows.map(row => row.votesScoreUp),
      rows.map(row => row.votesScoreDown),
      rows.map(row => row.votesCountUp),
      rows.map(row => row.votesCountDown),
    ],
  )
  await transaction(`/* seedCommunityHotPosts:analyze */ ANALYZE posts, community_post_reviews`)
  await transaction.commit()
}
