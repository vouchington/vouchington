import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, getContributionAdmissionAuditForTest } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('posts.admin-create', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('POST /api/v1/posts admin create', () => {
    it('immediately approves admin-created posts', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request
        .post('/api/v1/posts')
        .send({
          post_type: 'discussion',
          title: 'Admin Post',
          markdown: 'Admin post content',
        })
        .expect(201)

      expect(response.body.post).toHaveProperty('id')
      expect(response.body.post.clearance_status).toBe('approved')
    })

    it.each(['article', 'blog_post'] as const)('persists admin %s posts', async post_type => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const idempotencyKey = randomUUID()

      const response = await request
        .post('/api/v1/posts')
        .set('Idempotency-Key', idempotencyKey)
        .send({ post_type, title: `Admin ${post_type}`, markdown: 'Admin content' })
        .expect(201)

      expect(response.body.post.post_type).toBe(post_type)
      expect(
        await getContributionAdmissionAuditForTest({ actorId: admin.id, idempotencyKey }),
      ).toMatchObject({ source: post_type, postType: post_type, policyRevision: 'capacity-exempt' })
    })
  })
})
