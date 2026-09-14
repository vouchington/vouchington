import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { normalizeRouteAdmissionIntent } from '@services/contribution-gating/admit-route-contribution'

describe('POST /api/v1/posts admission replay', () => {
  it('replays a committed post after its submitted topic is deleted', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)
    const topicId = await insertTestTopic({
      name: crypto.randomUUID(),
      slug: crypto.randomUUID(),
      createdById: user.id,
    })
    const postId = await insertTestPost({
      title: 'Persisted post replay',
      markdown: 'Persisted before the response was lost.',
      createdById: user.id,
      slug: crypto.randomUUID(),
    })
    const key = crypto.randomUUID()
    const body = {
      title: 'Persisted post replay',
      markdown: 'Persisted before the response was lost.',
      categories: [{ type: 'topic', topic_id: topicId }],
    }
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: key,
        intent: normalizeRouteAdmissionIntent({ route: 'posts.create', body }),
        execute: async () => ({ id: postId }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await softDeleteTopic(topicId, user.id)

    const response = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)

    expect(response.body).toEqual({ post: { id: postId } })
  })
})
