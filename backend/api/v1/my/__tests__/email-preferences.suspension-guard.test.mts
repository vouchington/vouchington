import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createEmailUnsubscribeToken, getEmailPreferences } from '@services/users'

describe('email preference suspension guard', () => {
  const suspendedUserIds: string[] = []

  beforeEach(() => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  async function createSuspendedUser() {
    const user = await createTestUser()
    await suspendTestUser(user.id)
    suspendedUserIds.push(user.id)
    return user
  }

  it('PATCH /api/v1/my/email-preferences refuses a suspended user without changing preferences', async () => {
    const user = await createSuspendedUser()
    const before = await getEmailPreferences(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/email-preferences')
      .send({ engagement_emails_enabled: false, news_digest_frequency: 'daily' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await getEmailPreferences(user.id)).toEqual(before)
  })

  it('keeps the signed-token unsubscribe available to a suspended user', async () => {
    const user = await createSuspendedUser()
    const token = createEmailUnsubscribeToken(user.id, 'outcome_emails')

    await createRequest().post('/api/v1/email-unsubscribe').send({ token }).expect(200)

    expect((await getEmailPreferences(user.id)).engagement_emails_enabled).toBe(false)
  })
})
