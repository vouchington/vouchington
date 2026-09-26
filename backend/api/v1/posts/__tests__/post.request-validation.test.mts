import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  getContributionAdmissionConsumptionCountForTest,
  getContributionAdmissionReservationStateForTest,
  insertTestPost,
} from '@voucha/test-helpers'

describe('post request validation', () => {
  it('rejects malformed post types without retaining admissions or consuming quota', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    for (const postType of ['', 'x'.repeat(65), 42]) {
      const idempotencyKey = crypto.randomUUID()
      await request
        .post('/api/v1/posts')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          post_type: postType,
          title: 'Malformed post type',
          markdown: 'Malformed post type content.',
        })
        .expect(422)
      await expect(
        getContributionAdmissionReservationStateForTest({
          actorId: user.id,
          idempotencyKey,
        }),
      ).resolves.toBeNull()
    }

    await expect(
      getContributionAdmissionConsumptionCountForTest(user.id, 'discussion'),
    ).resolves.toBe(0)
  })

  it('rejects an authorized malformed create title', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/posts')
      .send({ post_type: 'discussion', title: 42, markdown: 'Malformed title content.' })
      .expect(422)
  })

  it('rejects an owner-visible malformed patch without changing the title', async () => {
    const owner = await createTestUser()
    const title = `Original title ${crypto.randomUUID()}`
    const postId = await insertTestPost({
      title,
      slug: `owner-malformed-patch-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'Owner malformed patch content.',
    })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request.patch(`/api/v1/posts/${postId}`).send({ title: 42 }).expect(422)

    expect((await request.get(`/api/v1/posts/${postId}`).expect(200)).body.post.title).toBe(title)
  })

  it('masks an inaccessible private post before malformed patch diagnostics', async () => {
    const owner = await createTestUser()
    const viewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Private patch ${crypto.randomUUID()}`,
      slug: `private-malformed-patch-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'Private malformed patch content.',
      privacy: 'private',
      broadcast: 'followers',
    })
    const request = createRequest()
    await request.authenticateAs(viewer)

    await request.patch(`/api/v1/posts/${postId}`).send({ title: 42 }).expect(404)
  })

  it('allows an administrator to update ai_summary_markdown', async () => {
    const admin = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    const postId = await insertTestPost({
      title: `AI summary ${crypto.randomUUID()}`,
      slug: `ai-summary-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'AI summary test content.',
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .patch(`/api/v1/posts/${postId}`)
      .send({ ai_summary_markdown: 'Administrator supplied summary.' })
      .expect(200)

    expect(
      (await request.get(`/api/v1/posts/${postId}`).expect(200)).body.post.ai_summary_markdown,
    ).toBe('Administrator supplied summary.')
  })

  it('returns 403 for a non-admin ai_summary_markdown update before malformed diagnostics', async () => {
    const owner = await createTestUser()
    const postId = await insertTestPost({
      title: `AI summary non-admin ${crypto.randomUUID()}`,
      slug: `ai-summary-non-admin-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'AI summary non-admin test content.',
    })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request.patch(`/api/v1/posts/${postId}`).send({ ai_summary_markdown: 42 }).expect(403)
  })
})
