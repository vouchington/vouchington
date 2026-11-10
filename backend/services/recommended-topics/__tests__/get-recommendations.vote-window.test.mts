import { it, expect, describe, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  linkPostToTopic,
  insertPostElectionVoteAt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getRecommendedTopics } from '@services/recommended-topics'
import { recommendedTopicsWorkConfig } from '@services/recommended-topics/work-limits'

const MINUTE_MS = 60_000

describe('get-recommendations.vote-window', () => {
  it('reads only the newest votes and keeps the latest vote per post inside that window', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedTopicsWorkConfig, { vote_history_window: 3 }),
    )
    const user = await createTestUser()
    const suffix = `${Date.now()}-${Math.random()}`
    const [outsideWindow, replaced, kept] = await Promise.all(
      ['outside', 'replaced', 'kept'].map(async label => {
        const topicId = await insertTestTopic({
          name: `Vote window ${label} ${suffix}`,
          slug: `vote-window-${label}-${suffix}`,
          createdById: user.id,
        })
        const postId = await insertTestPost({
          title: `Vote window ${label} ${suffix}`,
          slug: `vote-window-post-${label}-${suffix}`,
          markdown: label,
          createdById: user.id,
        })
        await linkPostToTopic(postId, topicId, user.id)
        return { topicId, postId }
      }),
    )
    const start = Date.now() - 10 * MINUTE_MS
    const votes = [
      [outsideWindow, 1],
      [replaced, 1],
      [kept, 1],
      [replaced, -1],
    ] as const
    for (const [index, [entry, score]] of votes.entries())
      await insertPostElectionVoteAt(
        user.id,
        entry.postId,
        score,
        new Date(start + index * MINUTE_MS),
      )

    const topicIds = (await getRecommendedTopics(user, {})).results.map(topic => topic.id)

    expect(topicIds).toContain(kept.topicId)
    expect(topicIds).not.toContain(replaced.topicId)
    expect(topicIds).not.toContain(outsideWindow.topicId)
  })
})
