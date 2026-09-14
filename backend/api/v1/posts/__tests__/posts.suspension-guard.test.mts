import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserWithAge,
  suspendTestUser,
  unsuspendTestUser,
  CONTRIBUTING_USER_AGE_MS,
  safeUsername,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('suspension guard on write routes', () => {
  it('suspended user gets 403 with ACCOUNT_SUSPENDED on POST /api/v1/posts', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      username: safeUsername('susp-guard-create'),
    })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'discussion',
        title: 'test post',
        markdown: 'hello world',
      })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('unsuspended user can create posts', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      username: safeUsername('susp-guard-unsuspend'),
    })
    await suspendTestUser(user.id)
    await unsuspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/posts')
      .send({
        post_type: 'discussion',
        title: 'test post after unsuspend',
        markdown: 'hello world',
      })
      .expect(201)
  })
})
