import { beforeAll, describe, expect, it } from 'vitest'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import {
  createTestUser,
  safeUsername,
  addVerifiedEmailForUser,
  setTestUserEmailAddressId,
  getLatestEmailAddressLoginTokenHash,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createEmailVerificationToken } from '@services/my/email-address-verification'
import { updateUserFields } from '@services/users/update-fields'
import { encodeCursor } from '@modules/pagination'
import { v7 as uuidv7 } from 'uuid'

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
    expect(response.body.identity.account_type).toBeNull()
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
    const pageUser = await createTestUser()
    const laterName = `tests+email-page-z-${randomSuffix()}@voucha.ai`
    const earlierName = `tests+email-page-a-${randomSuffix()}@voucha.ai`
    await addVerifiedEmailForUser(pageUser.id, laterName)
    await addVerifiedEmailForUser(pageUser.id, earlierName)
    const sameMillisecond = Date.now()
    const [earlierId, laterId] = [
      uuidv7({ msecs: sameMillisecond }),
      uuidv7({ msecs: sameMillisecond }),
    ].toSorted()
    await setTestUserEmailAddressId(pageUser.id, laterName, earlierId!)
    await setTestUserEmailAddressId(pageUser.id, earlierName, laterId!)
    const request = createRequest()
    await request.authenticateAs(pageUser)
    const first = await request.get('/api/v1/my/email-addresses?limit=1').expect(200)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.results[0].is_primary).toBe(true)
    expect(first.body.results[0]).not.toHaveProperty('id')
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
    expect(second.body.results[0].email_address).toBe(laterName)
    expect(second.body.results[0].is_primary).toBe(false)
    const third = await request
      .get(
        `/api/v1/my/email-addresses?limit=1&after=${encodeURIComponent(second.body.page_info.end_cursor as string)}`,
      )
      .expect(200)
    expect(third.body.results[0].email_address).toBe(earlierName)
  })

  it('rejects malformed and unsupported-tier email address cursors', async () => {
    const cursorUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(cursorUser)
    const scope = `email-addresses:${cursorUser.id}:primary-desc-id-asc`
    const unsupportedTierCursor = encodeCursor({ tier: 2, id: cursorUser.id, scope })

    await request
      .get('/api/v1/my/email-addresses')
      .query({ after: unsupportedTierCursor })
      .expect(400)
    await request.get('/api/v1/my/email-addresses').query({ after: 'not-json' }).expect(400)
    await request
      .get('/api/v1/my/email-addresses')
      .query({ after: encodeCursor({ tier: 0, id: 'not-a-uuid', scope }) })
      .expect(400)
  })
})

describe('POST /api/v1/my/email-addresses + verify flow', () => {
  installEmailDomainDnsMock()

  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 422 when email_address missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/email-addresses').send({}).expect(422)
  })

  it('queues verification email with the user UI locale', async () => {
    await updateUserFields(user.id, { ui_locale: 'fr' })
    const suffix = randomSuffix()
    const newEmail = `${TEST_EMAIL_BASE}-queued-${suffix}@voucha.ai`

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({
        email_address: newEmail,
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(200)

    expect(response.body.email_address).toBe(newEmail)
  })

  it('sends verification code and verifies to add email', async () => {
    const suffix = randomSuffix()
    const newEmail = `${TEST_EMAIL_BASE}-verify-${suffix}@voucha.ai`

    // Create token directly via service to avoid real email sending in test
    const { token } = await createEmailVerificationToken(user.id, newEmail)
    const storedHash = await getLatestEmailAddressLoginTokenHash(newEmail)
    expect(storedHash).toMatch(/^[A-F0-9]{64}$/)
    expect(storedHash).not.toBe(token)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(newEmail)}/verifications`)
      .send({ token, re_auth_token: await createTestAccountChangeProof(user.id, request) })
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
      .send({
        token: 'WRONGTOK',
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(400)
  })
})
