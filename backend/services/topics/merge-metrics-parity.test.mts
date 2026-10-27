import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  aggregateElectionVoteStatsFromPrimary,
  updateElectionStatsIfChanged,
} from '@services/elections-votes/shared'
import { TOPIC_ELECTION_CONFIG } from '@services/elections-votes/topic/config'
import {
  archivePostForTopHashtagTest,
  createTestTopic,
  createTestUser,
  insertTestReview,
  insertTopicElectionVote,
  refreshTestTopicBookmarkStats,
  setTestUserAdminVoteWeight,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getTopicMergeMetricProjection,
  getTopicMergeVoteHistory,
  seedTopicMergeMetricFollows,
} from '@voucha/test-helpers/topic-merge-metrics-parity'
import {
  createTopicMergeNativeOperation,
  getTopicMergeNativeCheckpoint,
} from '@voucha/test-helpers/topic-merge-native-operation'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
import { topicMergeWorkConfig } from './merge-work-limits.mts'
import { updateTopicRatingStats } from './ratings.mts'

describe('bounded topic merge metric parity', () => {
  it('matches canonical vote, rating, and follow totals across one-row pages and rejects an old vote snapshot', async () => {
    const administrator = await createTestUser({ administrator: true })
    const [
      cleared,
      semanticDown,
      legacyUp,
      semanticUp,
      lowReview,
      neutralVote,
      legacyDown,
      neutralReview,
    ] = await Promise.all(Array.from({ length: 8 }, () => createTestUser()))
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    await Promise.all([
      setTestUserAdminVoteWeight(cleared.id, 2),
      setTestUserAdminVoteWeight(semanticDown.id, 3),
      setTestUserAdminVoteWeight(legacyUp.id, 4),
      setTestUserAdminVoteWeight(semanticUp.id, 5),
    ])

    const now = Date.now()
    await insertTopicElectionVote(cleared.id, source.id, 1, uuidv7({ msecs: now - 3_000 }))
    await insertTopicElectionVote(cleared.id, source.id, null, uuidv7({ msecs: now - 2_000 }))
    await insertTopicElectionVote(semanticDown.id, source.id, -1, undefined, false, true)
    await insertTopicElectionVote(legacyUp.id, destination.id, 1)
    await insertTopicElectionVote(legacyUp.id, source.id, -1)
    await insertTopicElectionVote(legacyUp.id, source.id, null)
    await insertTopicElectionVote(semanticUp.id, source.id, 1, undefined, false, true)
    await insertTopicElectionVote(neutralVote.id, source.id, 0, undefined, true)
    await insertTopicElectionVote(legacyDown.id, source.id, -1)

    await insertTestReview({
      userId: cleared.id,
      topicRatings: [{ topicId: source.id, rating: 5 }],
      createdAt: new Date(now - 3_000),
    })
    const ineligibleNewer = await insertTestReview({
      userId: cleared.id,
      topicRatings: [{ topicId: source.id, rating: 1 }],
      createdAt: new Date(now - 1_000),
    })
    await archivePostForTopHashtagTest(ineligibleNewer, cleared.id)
    await insertTestReview({
      userId: semanticDown.id,
      topicRatings: [{ topicId: source.id, rating: 3 }],
    })
    await Promise.all([
      insertTestReview({
        userId: legacyUp.id,
        topicRatings: [{ topicId: source.id, rating: 2 }],
      }),
      insertTestReview({
        userId: semanticUp.id,
        topicRatings: [{ topicId: source.id, rating: 4 }],
      }),
      insertTestReview({
        userId: lowReview.id,
        topicRatings: [{ topicId: source.id, rating: 1 }],
      }),
      insertTestReview({
        userId: neutralReview.id,
        topicRatings: [{ topicId: source.id, rating: 3 }],
      }),
    ])
    await seedTopicMergeMetricFollows([
      { userId: cleared.id, topicId: source.id, deleted: false },
      { userId: cleared.id, topicId: destination.id, deleted: true },
      { userId: semanticDown.id, topicId: source.id, deleted: true },
      { userId: semanticDown.id, topicId: destination.id, deleted: false },
      { userId: legacyUp.id, topicId: source.id, deleted: false },
    ])

    // Capture the old destination vote projection before any source ballot moves.
    const staleAggregate = await aggregateElectionVoteStatsFromPrimary(
      TOPIC_ELECTION_CONFIG,
      destination.id,
    )
    expect(staleAggregate.votes_score_up).toBe(8)

    const operationId = await createTopicMergeNativeOperation(
      source.id,
      destination.id,
      administrator.id,
    )
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))
    let generation: number | null = 0
    for (let page = 0; page < 2_000 && generation !== null; page += 1) {
      generation = await processTopicMergeOperationPage(operationId, generation)
    }
    if (generation !== null) {
      const checkpoint = await getTopicMergeNativeCheckpoint(operationId)
      throw new Error(
        `Topic merge metric parity exceeded 2,000 pages at ${checkpoint.stage}, generation ${checkpoint.generation}`,
      )
    }
    await expect(getTopicMergeNativeCheckpoint(operationId)).resolves.toMatchObject({
      completed_at: expect.any(Date),
      failed_at: null,
    })

    await expect(
      getTopicMergeVoteHistory(legacyUp.id, [source.id, destination.id]),
    ).resolves.toEqual([{ topic_id: destination.id, score: 1 }])
    const merged = await getTopicMergeMetricProjection(destination.id)
    await expect(
      getTopicMergeVoteHistory(cleared.id, [source.id, destination.id]),
    ).resolves.toEqual([
      { topic_id: destination.id, score: 1 },
      { topic_id: destination.id, score: null },
    ])
    expect(merged).toMatchObject({
      votes_score_up: 13,
      votes_score_none: 1,
      votes_score_down: 5,
      votes_count_up: 2,
      votes_count_none: 1,
      votes_count_down: 2,
      ratings__score__1: 2,
      ratings__score__2: 7,
      ratings__score__3: 2,
      ratings__score__4: 5,
      ratings__score__5: 2,
      ratings__count__1: 1,
      ratings__count__2: 1,
      ratings__count__3: 2,
      ratings__count__4: 1,
      ratings__count__5: 1,
      bookmarks__follow_count: 3,
    })
    expect(merged.votes_snapshot_xmax).not.toBeNull()

    const canonical = await aggregateElectionVoteStatsFromPrimary(
      TOPIC_ELECTION_CONFIG,
      destination.id,
    )
    expect({
      votes_score_up: merged.votes_score_up,
      votes_score_none: merged.votes_score_none,
      votes_score_down: merged.votes_score_down,
      votes_count_up: merged.votes_count_up,
      votes_count_none: merged.votes_count_none,
      votes_count_down: merged.votes_count_down,
    }).toEqual({
      votes_score_up: canonical.votes_score_up,
      votes_score_none: canonical.votes_score_none,
      votes_score_down: canonical.votes_score_down,
      votes_count_up: canonical.votes_count_up,
      votes_count_none: canonical.votes_count_none,
      votes_count_down: canonical.votes_count_down,
    })

    await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, destination.id, staleAggregate)
    expect(await getTopicMergeMetricProjection(destination.id)).toEqual(merged)
    await updateTopicRatingStats(destination.id)
    expect(await getTopicMergeMetricProjection(destination.id)).toEqual(merged)
    await refreshTestTopicBookmarkStats(destination.id)
    expect(await getTopicMergeMetricProjection(destination.id)).toEqual(merged)

    await setTestUserAdminVoteWeight(semanticUp.id, 6)
    const newerAggregate = await aggregateElectionVoteStatsFromPrimary(
      TOPIC_ELECTION_CONFIG,
      destination.id,
    )
    expect(newerAggregate.votes_score_up).toBe(14)
    await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, destination.id, newerAggregate)
    const newerProjection = await getTopicMergeMetricProjection(destination.id)
    expect(newerProjection.votes_score_up).toBe(14)
    await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, destination.id, staleAggregate)
    expect(await getTopicMergeMetricProjection(destination.id)).toEqual(newerProjection)
  })
})
