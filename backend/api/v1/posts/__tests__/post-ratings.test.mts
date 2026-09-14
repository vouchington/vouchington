import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createTestTopic,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { createPost } from '@services/posts/create'

describe('post ratings', () => {
  it('allows a review author to add and update a topic rating', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const initialTopic = await createTestTopic({ user })
    const topic = await createTestTopic({ user })
    const review = await createPost(user, {
      title: 'Review with rating route coverage',
      markdown:
        'This review has enough detail to pass the minimum review content validation. It rates several concrete aspects and provides useful context for the rating workflow test. The author explains strengths, weaknesses, tradeoffs, and repeatable observations clearly.',
      post_type: 'review',
      review_topic_ratings: [{ topic_id: initialTopic.id, rating: 3 }],
    })
    await approveTestPost(review.id)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/posts/${review.id}/ratings`)
      .send({ topic_id: topic.id, rating: 4, order_index: 0 })
      .expect(204)

    await request
      .patch(`/api/v1/posts/${review.id}/ratings/${topic.id}`)
      .send({ rating: 5, order_index: 1 })
      .expect(204)
  })
})
