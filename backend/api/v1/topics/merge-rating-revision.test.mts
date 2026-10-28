import { describe, expect, it, onTestFinished } from 'vitest'
import { setPostClearanceStatus } from '@services/post-clearance/set-status'
import { createTestTopic, createTestUser, insertTestReview } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { deleteTopicMergeNativeOperation } from '@voucha/test-helpers/topic-merge-native-operation'
import { getTopicMergeRatingRevisionState } from '@voucha/test-helpers/topic-merge-rating-revision'
import { processTopicMergeOperationPage } from '@services/topics/merge-operation-page'
import { topicMergeWorkConfig } from '@services/topics/merge-work-limits'
import { updateTopicRatingStats } from '@services/topics/ratings'

describe('topic merge rating revision fence', () => {
  it('rebuilds one-row metric scratch after a destination review refresh finishes before finalization', async () => {
    const administrator = await createTestUser({ administrator: true })
    const [firstReviewer, secondReviewer] = await Promise.all([createTestUser(), createTestUser()])
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    const reviewIds = await Promise.all([
      insertTestReview({
        userId: firstReviewer.id,
        topicRatings: [{ topicId: destination.id, rating: 5 }],
      }),
      insertTestReview({
        userId: secondReviewer.id,
        topicRatings: [{ topicId: destination.id, rating: 5 }],
      }),
    ])
    const request = createRequest()
    await request.authenticateAs(administrator)
    const response = await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(202)
    const operationId: string = response.body.topic_merge.id
    onTestFinished(overrideDynamicConfigFieldsForTest(topicMergeWorkConfig, { page_size: 1 }))

    try {
      let state = await getTopicMergeRatingRevisionState(operationId)
      expect(state).toMatchObject({ ratings_revision: '0', ratings_count_5: 0 })
      for (let page = 0; page < 2_000 && state.stage !== 'finalize'; page += 1) {
        const next = await processTopicMergeOperationPage(operationId, state.generation)
        if (next === null)
          throw new Error(`Topic merge ended before rating finalization at ${state.stage}`)
        state = await getTopicMergeRatingRevisionState(operationId)
      }
      if (state.stage !== 'finalize')
        throw new Error(`Topic merge did not reach finalization at ${state.stage}`)
      expect(state).toMatchObject({
        metric_users: 2,
        captured_rating_count_5: 2,
        metric_snapshot_captured: true,
        ratings_count_5: 0,
        source_merged_into_topic_id: null,
      })
      const capturedRevision = state.metric_rating_revision
      expect(capturedRevision).toBe('0')

      for (const reviewId of reviewIds)
        await expect(
          setPostClearanceStatus(reviewId, 'rejected', administrator.id),
        ).resolves.not.toBeNull()
      await updateTopicRatingStats(destination.id)
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state.ratings_count_5).toBe(0)
      expect(state.ratings_revision).not.toBe(capturedRevision)
      const refreshedRevision = state.ratings_revision

      await expect(processTopicMergeOperationPage(operationId, state.generation)).resolves.toBe(
        state.generation + 1,
      )
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state).toMatchObject({
        stage: 'vote_aggregation',
        stage_table_position: 4,
        metric_users: 2,
        captured_rating_count_5: 0,
        metric_rating_revision: null,
        metric_snapshot_captured: false,
        ratings_count_5: 0,
        source_merged_into_topic_id: null,
      })

      for (const remaining of [1, 0]) {
        const next = await processTopicMergeOperationPage(operationId, state.generation)
        if (next === null) throw new Error('Topic merge ended during bounded metric reset')
        state = await getTopicMergeRatingRevisionState(operationId)
        expect(state).toMatchObject({
          stage: 'vote_aggregation',
          stage_table_position: 4,
          metric_users: remaining,
        })
      }
      const resetDone = await processTopicMergeOperationPage(operationId, state.generation)
      if (resetDone === null) throw new Error('Topic merge ended before metric recapture')
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state).toMatchObject({ stage: 'vote_aggregation', stage_table_position: 0 })

      const recaptured = await processTopicMergeOperationPage(operationId, state.generation)
      if (recaptured === null) throw new Error('Topic merge ended before its fresh metric snapshot')
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state.metric_rating_revision).toBe(refreshedRevision)
      expect(state.metric_snapshot_captured).toBe(true)

      let next: number | null = state.generation
      for (let page = 0; page < 2_000 && next !== null; page += 1) {
        next = await processTopicMergeOperationPage(operationId, next)
      }
      if (next !== null) throw new Error('Topic merge did not complete within 2,000 pages')
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state).toMatchObject({
        completed_at: expect.any(Date),
        failed_at: null,
        ratings_count_5: 0,
        source_merged_into_topic_id: destination.id,
      })
      const completedRevision = state.ratings_revision
      await updateTopicRatingStats(destination.id)
      state = await getTopicMergeRatingRevisionState(operationId)
      expect(state.ratings_count_5).toBe(0)
      expect(state.ratings_revision).not.toBe(completedRevision)
    } finally {
      await deleteTopicMergeNativeOperation(operationId)
    }
  })
})
