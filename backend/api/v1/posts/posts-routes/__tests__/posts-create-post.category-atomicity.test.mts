import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import {
  getPostCategoryMutationCounts,
  withRejectedPostCategoryVotes,
} from '@voucha/test-helpers/post-category-vote-failures'
import { getPostByAny } from '@services/posts/get'
import { updatePost } from '@services/posts/update'

describe('POST /api/v1/posts category atomicity', () => {
  it('returns 5xx on a vote failure, rolls back all post rows, and permits a same-key retry', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)
    const suffix = randomUUID().replaceAll('-', '')
    const topicId = await insertTestTopic({
      name: `Atomic category ${suffix}`,
      slug: `atomic-category-${suffix}`,
      createdById: user.id,
    })
    const key = randomUUID()
    const body = {
      title: `Atomic post ${suffix}`,
      markdown: `Atomic category #atomic${suffix}`,
      categories: [{ type: 'topic', topic_id: topicId }],
    }
    const before = await getPostCategoryMutationCounts(user.id)

    await withRejectedPostCategoryVotes(user.id, async () => {
      const failed = await request.post('/api/v1/posts').set('Idempotency-Key', key).send(body)
      expect(failed.status).toBeGreaterThanOrEqual(500)
      expect(failed.status).toBeLessThan(600)
    })
    expect(await getPostCategoryMutationCounts(user.id)).toEqual(before)

    const created = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )
    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(replay.body).toEqual(created.body)
    expect((await getPostCategoryMutationCounts(user.id)).posts).toBe(before.posts + 1)
  })

  it('replays the first committed categories and title after a later category edit', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)
    const suffix = randomUUID().replaceAll('-', '')
    const [originalTopic, laterTopic] = await Promise.all(
      ['original', 'later'].map(label =>
        insertTestTopic({
          name: `${label} category ${suffix}`,
          slug: `${label}-category-${suffix}`,
          createdById: user.id,
        }),
      ),
    )
    const key = randomUUID()
    const body = {
      title: `Original category response ${suffix}`,
      categories: [{ type: 'topic', topic_id: originalTopic! }],
    }
    const created = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: originalTopic })]),
    )
    const post = await getPostByAny(created.body.post.id, { readOnly: false })
    if (!post) throw new Error('Expected committed category post')
    const edited = await updatePost(user, post, {
      title: `Later category response ${suffix}`,
      categories: [{ type: 'topic', topic_id: laterTopic! }],
    })
    expect(edited!.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: laterTopic })]),
    )

    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(replay.body).toEqual(created.body)
  })
})
