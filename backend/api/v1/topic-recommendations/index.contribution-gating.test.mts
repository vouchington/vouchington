import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  addDisposableDomain,
  createTestMembership,
  createTestUserWithAge,
  getTestPrivateUserById,
  setPrimaryEmailForUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED, EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'

describe('topic recommendation contribution gates', () => {
  it('requires a verified email from an established Free user', async () => {
    const createdUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      noEmail: true,
    })
    const emailDomain = `topic-gate-${randomUUID()}.test`
    await setPrimaryEmailForUser(createdUser.id, `user@${emailDomain}`)
    await addDisposableDomain(emailDomain)
    await invalidateVerifiedEmailCache(createdUser.id)
    const user = (await getTestPrivateUserById(createdUser.id))!
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/topic-recommendations')
      .send({ topic_title: 'Missing email gate' })
      .expect(403)

    expect(response.body.code).toBe(EMAIL_VERIFICATION_REQUIRED)
  })

  it('lets a fresh Plus member bypass the Free contribution gate', async () => {
    const user = await createTestUserWithAge(60_000)
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const request = createRequest()
    await request.authenticateAs(user)
    const unique = randomUUID()

    const response = await request
      .post('/api/v1/topic-recommendations')
      .send({
        markdown: 'Paid members bypass the Free contribution gate.',
        topic_title: `Plus Topic ${unique}`,
        topic_slug: `plus-topic-${unique}`,
      })
      .expect(201)

    expect(response.body.post.post_type).toBe('topic_recommendation')
  })

  it('rejects suspended recommendation authors before request parsing', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await suspendTestUser(user.id)
    try {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/topic-recommendations')
        .set('Content-Type', 'application/json')
        .send('not-json')
        .expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
})
