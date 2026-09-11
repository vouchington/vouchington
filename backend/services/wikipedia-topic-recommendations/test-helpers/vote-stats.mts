import { setTimeout as sleep } from 'node:timers/promises'

import { getPostElectionById, updatePostElectionVoteStats } from '@services/elections-votes/post'

export async function refreshRecommendationVoteStats({
  lowScoreId,
  highScoreId,
}: {
  lowScoreId: string
  highScoreId: string
}) {
  const maxAttempts = 12
  const delayMs = 50

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await Promise.all([
      updatePostElectionVoteStats(lowScoreId),
      updatePostElectionVoteStats(highScoreId),
    ])

    const [lowStats, highStats] = await Promise.all([
      getPostElectionById(lowScoreId),
      getPostElectionById(highScoreId),
    ])
    if (
      lowStats &&
      highStats &&
      lowStats.votes_count_up === 1 &&
      lowStats.votes_score_net === 1 &&
      highStats.votes_count_up === 2 &&
      highStats.votes_score_net === 2
    ) {
      return
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs)
    }
  }

  const [lowStats, highStats] = await Promise.all([
    getPostElectionById(lowScoreId),
    getPostElectionById(highScoreId),
  ])
  throw new Error(
    `Topic recommendation vote stats did not refresh as expected: ${JSON.stringify({
      lowScoreId,
      highScoreId,
      lowStats,
      highStats,
    })}`,
  )
}
