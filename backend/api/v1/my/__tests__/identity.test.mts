import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  createRandomString,
  safeUsername,
  addVerifiedEmailForUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

import { createEmailVerificationToken } from '@services/my/email-addresses'

import { connectOAuthAccountToUser } from '@services/oauth'

import { updateUserFields } from '@services/users/update-fields'
import { encodeScopedTierPreciseNameCursor } from '@modules/pagination'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

const TEST_EMAIL_BASE = 'tests+my-identity'

describe('GET /api/v1/my/identity', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/identity').expect(401)
  })

  it('returns identity data for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/identity').expect(200)
    expect(response.body.identity.id).toBe(user.id)
    expect(response.body.identity.username).toBe(user.username)
    expect(response.body.identity.email_address).toBeDefined()
    expect(response.body.identity.is_official_account).toBe(false)
  })
})

describe('PATCH /api/v1/my/identity', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/identity').send({ username: 'newname' }).expect(401)
  })

  it('updates username successfully', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const newUsername = safeUsername('my-identity-user')
    const response = await request
      .patch('/api/v1/my/identity')
      .send({ username: newUsername })
      .expect(200)

    expect(response.body.identity.username).toBe(newUsername)
  })

  it('rejects duplicate username', async () => {
    const other = await createTestUser({
      username: safeUsername('my-identity-other'),
    })
    const request = createRequest()
    await request.authenticateAs(user)

    await request.patch('/api/v1/my/identity').send({ username: other!.username }).expect(422)
  })

  it('updates profile_image_id to null', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/identity')
      .send({ profile_image_id: null })
      .expect(200)

    expect(response.body.identity.profile_image_id).toBeNull()
  })
})

describe('GET /api/v1/my/email-addresses', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/email-addresses').expect(401)
  })

  it('returns email addresses for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/email-addresses').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.length).toBeGreaterThan(0)
  })

  it('paginates email addresses with an owner-scoped cursor', async () => {
    await addVerifiedEmailForUser(user.id, `tests+email-page-a-${randomSuffix()}@voucha.ai`)
    await addVerifiedEmailForUser(user.id, `tests+email-page-b-${randomSuffix()}@voucha.ai`)
    const request = createRequest()
    await request.authenticateAs(user)
    const first = await request.get('/api/v1/my/email-addresses?limit=1').expect(200)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.results[0].is_primary).toBe(true)
    expect(first.body.page_info.start_cursor).toEqual(expect.any(String))

    const otherUser = await createTestUser()
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherUser)
    await otherRequest
      .get(
        `/api/v1/my/email-addresses?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(400)

    const second = await request
      .get(
        `/api/v1/my/email-addresses?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(200)
    expect(second.body.results[0].email_address).not.toBe(first.body.results[0].email_address)
    expect(second.body.results[0].is_primary).toBe(false)
  })

  it('rejects malformed and unsupported-tier email address cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const unsupportedTierCursor = encodeScopedTierPreciseNameCursor(
      2,
      '2026-07-18T07:00:00.123456Z',
      'tests+cursor@voucha.ai',
      `email-addresses:${user.id}:primary-desc-created-asc-email-asc`,
    )

    await request
      .get('/api/v1/my/email-addresses')
      .query({ after: unsupportedTierCursor })
      .expect(400)
    await request.get('/api/v1/my/email-addresses').query({ after: 'not-json' }).expect(400)
  })
})

describe('POST /api/v1/my/email-addresses + verify flow', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 400 when email_address missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/email-addresses').send({}).expect(400)
  })

  it('queues verification email with the user UI locale', async () => {
    await updateUserFields(user.id, { ui_locale: 'fr' })
    const suffix = randomSuffix()
    const newEmail = `${TEST_EMAIL_BASE}-queued-${suffix}@voucha.ai`

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({ email_address: newEmail })
      .expect(200)

    expect(response.body.email_address).toBe(newEmail)
  })

  it('sends verification code and verifies to add email', async () => {
    const suffix = randomSuffix()
    const newEmail = `${TEST_EMAIL_BASE}-verify-${suffix}@voucha.ai`

    // Create token directly via service to avoid real email sending in test
    const { token } = await createEmailVerificationToken(user.id, newEmail)

    const request = createRequest()
    await request.authenticateAs(user)

    // Verify with the token
    const response = await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(newEmail)}/verifications`)
      .send({ token })
      .expect(200)

    const addedEmail = response.body.results.find(
      (e: { email_address: string }) => e.email_address === newEmail,
    )
    expect(addedEmail).toBeDefined()
  })

  it('returns 400 for invalid verification token', async () => {
    const suffix = randomSuffix()
    const newEmail = `${TEST_EMAIL_BASE}-invalid-${suffix}@voucha.ai`

    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(newEmail)}/verifications`)
      .send({ token: 'WRONGTOK' })
      .expect(400)
  })
})

describe('PATCH /api/v1/my/email-addresses/:email (set primary)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('sets an email as primary', async () => {
    const suffix = randomSuffix()
    const secondEmail = `${TEST_EMAIL_BASE}-primary-${suffix}@voucha.ai`

    // Add a second email via service
    const { token } = await createEmailVerificationToken(user.id, secondEmail)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}/verifications`)
      .send({ token })
      .expect(200)

    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        addVerifiedEmailForUser(user.id, `${TEST_EMAIL_BASE}-bounded-${index}-${suffix}@voucha.ai`),
      ),
    )

    // Now set it as primary
    const response = await request
      .patch(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}`)
      .send({ is_primary: true })
      .expect(200)

    const primary = response.body.results.find(
      (e: { email_address: string; is_primary: boolean }) => e.is_primary,
    )
    expect(primary?.email_address).toBe(secondEmail)
    expect(response.body.results).toHaveLength(25)
    expect(response.body.results[0].email_address).toBe(secondEmail)
    expect(response.body.page_info.has_next_page).toBe(true)
    expect(response.body.page_info.end_cursor).toEqual(expect.any(String))
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestOAuthAccount)
  void (0 as unknown as typeof connectTestOAuthAccount)
  void (0 as unknown as typeof createRandomString)
  void (0 as unknown as typeof onceEntityListenerCompleted)
  void (0 as unknown as typeof connectOAuthAccountToUser)
  void (0 as unknown as typeof updateUserFields)
})
