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

  it('checks rating deletion ownership before an invalid topic ID', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topic = await createTestTopic({ user: owner })
    const review = await createPost(owner, {
      title: 'Review rating deletion authorization',
      markdown:
        'This review has enough detail to pass the minimum review content validation. It explains the item clearly, identifies material strengths and weaknesses, and gives readers enough context for a useful rating assessment. The examples are concrete and the conclusion is clear.',
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topic.id, rating: 3 }],
    })
    await approveTestPost(review.id)
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherUser)

    await otherRequest.delete(`/api/v1/posts/${review.id}/ratings/not-a-uuid`).expect(403)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest.delete(`/api/v1/posts/${review.id}/ratings/not-a-uuid`).expect(422)
  })
})
