import { beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  createEmailUnsubscribeToken,
  getEmailPreferences,
  type EmailPreferences,
} from '@services/users'
import type { PrivateUser } from '@services/users/types'

const ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'

describe('GET /api/v1/my/email-preferences', () => {
  let user: PrivateUser

  beforeEach(async () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/email-preferences').expect(401)
  })

  it('returns email preferences for the current user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/email-preferences').expect(200)
    expect(response.body.email_preferences).toMatchObject({
      engagement_emails_enabled: true,
      news_digest_frequency: 'weekly',
      moderation_emails_enabled: true,
      community_digest_frequency: 'weekly',
    } satisfies Partial<EmailPreferences>)
  })
})

describe('PATCH /api/v1/my/email-preferences', () => {
  let user: PrivateUser

  beforeEach(async () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
    user = await createTestUser()
  })

  it('updates first-party email preferences', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/email-preferences')
      .send({
        engagement_emails_enabled: false,
        news_digest_frequency: 'daily',
        moderation_emails_enabled: false,
        community_digest_frequency: 'none',
        moderation_email_cadence: 'selected_days',
        moderation_email_days_of_week: [1, 3, 5],
        moderation_email_time_of_day: '10:30',
        moderation_email_timezone: 'UTC',
      })
      .expect(200)

    expect(response.body.email_preferences).toMatchObject({
      engagement_emails_enabled: false,
      news_digest_frequency: 'daily',
      moderation_emails_enabled: false,
      community_digest_frequency: 'none',
      moderation_email_cadence: 'selected_days',
      moderation_email_days_of_week: [1, 3, 5],
      moderation_email_time_of_day: '10:30',
      moderation_email_timezone: 'UTC',
    } satisfies Partial<EmailPreferences>)
  })

  it('rejects invalid frequencies', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/email-preferences')
      .send({ news_digest_frequency: 'hourly' })
      .expect(422)
  })
})

describe('POST /api/v1/email-unsubscribe', () => {
  beforeEach(() => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
  })

  it('does not require login to unsubscribe from outcome emails', async () => {
    const user = await createTestUser()
    const token = createEmailUnsubscribeToken(user.id, 'outcome_emails')
    const request = createRequest()

    await request
      .post(`/api/v1/email-unsubscribe?token=${encodeURIComponent(token)}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('List-Unsubscribe=One-Click')
      .expect(200)

    await expect(getEmailPreferences(user.id)).resolves.toMatchObject({
      engagement_emails_enabled: false,
    } satisfies Partial<EmailPreferences>)
  })

  it.each([
    ['news_digest' as const, { news_digest_frequency: 'none' }],
    [
      'community_digest' as const,
      { moderation_emails_enabled: false, community_digest_frequency: 'none' },
    ],
  ])('unsubscribes from the %s category', async (category, expected) => {
    const user = await createTestUser()
    const token = createEmailUnsubscribeToken(user.id, category)

    await createRequest()
      .post(`/api/v1/email-unsubscribe?token=${encodeURIComponent(token)}`)
      .expect(200)

    await expect(getEmailPreferences(user.id)).resolves.toMatchObject(expected)
  })

  it('rejects an invalid unsubscribe token without login', async () => {
    await createRequest().post('/api/v1/email-unsubscribe?token=invalid').expect(400)
  })

  it('accepts an unsubscribe token in the request body', async () => {
    const user = await createTestUser()
    const token = createEmailUnsubscribeToken(user.id, 'outcome_emails')

    await createRequest().post('/api/v1/email-unsubscribe').send({ token }).expect(200)

    await expect(getEmailPreferences(user.id)).resolves.toMatchObject({
      engagement_emails_enabled: false,
    } satisfies Partial<EmailPreferences>)
  })
})
