import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'

describe('recommendation reviewer sidecars', () => {
  it('preserves recommendation reviewers in post detail and filtered post pages', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    const reviewer = createRequest()
    await request.authenticateAs(author)
    await reviewer.authenticateAs(admin)
    const suffix = crypto.randomUUID()
    const created = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'topic_recommendation',
        markdown: 'Reviewer sidecar coverage',
        topic_title: `Reviewer ${suffix}`,
        topic_slug: `reviewer-${suffix}`,
      })
      .expect(201)
    const id = created.body.post.id as string
    await reviewer.post(`/api/v1/posts/${id}/approvals`).send({}).expect(200)
    const detail = await request.get(`/api/v1/posts/${id}`).expect(200)
    const page = await request
      .get(
        `/api/v1/posts?post_types=topic_recommendation&creator=${author.id}&topic_recommendation_status=approved`,
      )
      .expect(200)
    expect(detail.body.post.topic_recommendation).toMatchObject({
      status: 'approved',
      reviewed_by_id: admin.id,
    })
    expect(detail.body.users[admin.id].id).toBe(admin.id)
    expect(page.body.results.map((post: { id: string }) => post.id)).toEqual([id])
    expect(page.body.posts[id].topic_recommendation).toEqual(detail.body.post.topic_recommendation)
    expect(page.body.users[admin.id].id).toBe(admin.id)
  })
})
