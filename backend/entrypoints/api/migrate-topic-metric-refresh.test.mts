import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getElectionVoteMigrationClaim,
  getLatestTopicElectionVoteProvenance,
  getTopicElectionNetScore,
  createTestPost,
  insertTopicElectionVote,
  insertPostElectionVote,
  getTopicElectionVoteEventCount,
  setTopicElectionNeutralStats,
  getTopicElectionNeutralStats,
  insertPostElectionVoteAt,
  getLatestPostElectionVoteCreatedAt,
  followUser,
  pollUntilNotNull,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import {
  getPostElectionByIdCached,
  getTopicElectionByIdCachedBatch,
} from '@services/entity-fetch/get'
import { createTopic } from '@services/topics/create'
import { finalizeLegacySentimentProductionPromotion } from '@services/elections-votes/finalize-legacy-sentiment'
import { enqueueLegacySentimentTopicMetricRefreshes } from '@services/elections-votes/migrate-topic-metric-refresh'
import { getFollowedUsersByElectionVote } from '@services/users/follow-context'
import { getTopicElectionVote } from '@services/elections-votes/topic'

describe('legacy sentiment topic metric migration refresh', () => {
  it('awaits a real queue refresh after the durable migration repair commits', async () => {
    const suffix = randomUUID()
    const user = await createTestUser({
      administrator: true,
      username: `migration-cache-${suffix}`,
    })
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Migration cache ${suffix}`,
      slug: `migration-cache-${suffix}`,
    })
    const claimId = `test-refresh-legacy-sentiment-topic-rating-metrics-${suffix}`
    const [staleElection] = await getTopicElectionByIdCachedBatch([topic.id])
    expect(staleElection?.votes_score_net).toBe(0)
    await insertTopicElectionVote(user!.id, topic.id, 1)
    await expect(getLatestTopicElectionVoteProvenance(user!.id, topic.id)).resolves.toEqual({
      scoreIsSemantic: false,
    })
    await caches.topic_metrics.invalidateCacheGetByAny(topic.id)
    expect(await caches.topic_metrics.get(topic.id)).toBeNull()
    await enqueueLegacySentimentTopicMetricRefreshes(claimId)

    expect(await pollUntilNotNull(() => caches.topic_metrics.get(topic.id))).not.toBeNull()
    const refreshedElection = await pollUntilNotNull(async () => {
      const [election] = await getTopicElectionByIdCachedBatch([topic.id])
      return election?.votes_score_net === 2 ? election : null
    })
    expect(refreshedElection?.votes_score_net).toBe(await getTopicElectionNetScore(topic.id))
    await expect(getElectionVoteMigrationClaim(claimId)).resolves.toBe(claimId)
  })

  it('does not claim the durable refresh when enqueueing fails, so a retry can recover it', async () => {
    const suffix = randomUUID()
    const user = await createTestUser({
      administrator: true,
      username: `migration-retry-${suffix}`,
    })
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Migration retry ${suffix}`,
      slug: `migration-retry-${suffix}`,
    })
    const claimId = `test-retry-legacy-sentiment-topic-rating-metrics-${suffix}`
    await insertTopicElectionVote(user!.id, topic.id, 1)
    await caches.topic_metrics.invalidateCacheGetByAny(topic.id)

    await expect(
      enqueueLegacySentimentTopicMetricRefreshes(claimId, async () => {
        throw new Error('queue unavailable')
      }),
    ).rejects.toThrow('queue unavailable')

    await expect(getElectionVoteMigrationClaim(claimId)).resolves.toBeNull()
    await enqueueLegacySentimentTopicMetricRefreshes(claimId)
    expect(await pollUntilNotNull(() => caches.topic_metrics.get(topic.id))).not.toBeNull()
  })

  it('reconciles a latest legacy production-window ballot under a distinct retry-safe claim', async () => {
    const suffix = randomUUID()
    const user = await createTestUser({
      administrator: true,
      username: `migration-finalize-${suffix}`,
    })
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Migration finalize ${suffix}`,
      slug: `migration-finalize-${suffix}`,
    })
    const claimId = `test-finalize-legacy-sentiment-${suffix}`
    await insertTopicElectionVote(user!.id, topic.id, 1)
    await caches.topic_metrics.invalidateCacheGetByAny(topic.id)

    await finalizeLegacySentimentProductionPromotion(claimId)

    await expect(getLatestTopicElectionVoteProvenance(user!.id, topic.id)).resolves.toEqual({
      scoreIsSemantic: false,
    })
    const election = await pollUntilNotNull(async () => {
      const [current] = await getTopicElectionByIdCachedBatch([topic.id])
      return current?.votes_score_net === 2 ? current : null
    })
    expect(election?.votes_score_net).toBe(await getTopicElectionNetScore(topic.id))
    await expect(getElectionVoteMigrationClaim(claimId)).resolves.toBe(claimId)
  })

  it('retains a legacy Clear zero ballot without appending a production-finalization event', async () => {
    const suffix = randomUUID()
    const user = await createTestUser({
      administrator: true,
      username: `migration-finalize-clear-${suffix}`,
    })
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Migration finalize Clear ${suffix}`,
      slug: `migration-finalize-clear-${suffix}`,
    })
    const claimId = `test-finalize-legacy-sentiment-clear-${suffix}`
    await insertTopicElectionVote(user!.id, topic.id, 0)
    await setTopicElectionNeutralStats(topic.id, 4, 4)

    await finalizeLegacySentimentProductionPromotion(claimId)

    await expect(getTopicElectionVote(user!.id, topic.id)).resolves.toBeNull()
    await expect(getTopicElectionVoteEventCount(user!.id, topic.id)).resolves.toBe(1)
    await expect(getTopicElectionNeutralStats(topic.id)).resolves.toEqual({
      scoreNone: 0,
      countNone: 0,
    })
    await expect(getTopicElectionNetScore(topic.id)).resolves.toBe(0)
  })

  it('refreshes post election and metrics caches alongside topic cache reconciliation', async () => {
    const suffix = randomUUID()
    const user = await createTestUser({
      administrator: true,
      username: `migration-finalize-post-${suffix}`,
    })
    const post = await createTestPost({ user: user! })
    const claimId = `test-finalize-legacy-sentiment-post-${suffix}`
    expect((await getPostElectionByIdCached(post.id))?.votes_score_net).toBe(0)
    await caches.post_metrics.invalidateCacheGetByAny(post.id)
    await insertPostElectionVote(user!.id, post.id, 1)

    await finalizeLegacySentimentProductionPromotion(claimId)

    const election = await pollUntilNotNull(async () => {
      const current = await getPostElectionByIdCached(post.id)
      return current?.votes_score_net === 2 ? current : null
    })
    expect(election?.votes_score_net).toBe(2)
    expect(await pollUntilNotNull(() => caches.post_metrics.get(post.id))).not.toBeNull()
  })

  it('preserves historic vote activity ordering for post follow context during finalization', async () => {
    const suffix = randomUUID()
    const viewer = await createTestUser({ username: `migration-follow-viewer-${suffix}` })
    const olderVoter = await createTestUser({ username: `migration-follow-old-${suffix}` })
    const newerVoter = await createTestUser({ username: `migration-follow-new-${suffix}` })
    const post = await createTestPost({ user: viewer })
    const olderVoteAt = new Date('2020-01-01T00:00:00.000Z')
    const newerVoteAt = new Date('2021-01-01T00:00:00.000Z')
    const claimId = `test-finalize-legacy-sentiment-follow-context-${suffix}`
    await Promise.all([
      followUser(viewer, olderVoter),
      followUser(viewer, newerVoter),
      insertPostElectionVoteAt(olderVoter.id, post.id, 1, olderVoteAt),
      insertPostElectionVoteAt(newerVoter.id, post.id, 1, newerVoteAt),
    ])

    await finalizeLegacySentimentProductionPromotion(claimId)

    const [repairedOlderVoteAt, repairedNewerVoteAt] = await Promise.all([
      getLatestPostElectionVoteCreatedAt(olderVoter.id, post.id),
      getLatestPostElectionVoteCreatedAt(newerVoter.id, post.id),
    ])
    expect(repairedOlderVoteAt).not.toBeNull()
    expect(repairedNewerVoteAt).not.toBeNull()
    expect(repairedOlderVoteAt!.getTime()).toBeLessThan(Date.UTC(2022, 0, 1))
    expect(repairedNewerVoteAt!.getTime()).toBeLessThan(Date.UTC(2022, 0, 1))
    expect(repairedNewerVoteAt!.getTime()).toBeGreaterThan(repairedOlderVoteAt!.getTime())
    await expect(
      getFollowedUsersByElectionVote(viewer, post.id, 'post_votes', 1),
    ).resolves.toMatchObject({
      total: 2,
      users: [{ id: newerVoter.id }, { id: olderVoter.id }],
    })
  })
})
