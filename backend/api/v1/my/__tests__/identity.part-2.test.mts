import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  createRandomString,
  safeUsername,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

import { createEmailVerificationToken } from '@services/my/email-addresses'

import { connectOAuthAccountToUser } from '@services/oauth'

import { updateUserFields } from '@services/users/update-fields'
import { hasVerifiedNonDisposableEmail } from '@services/contribution-gating'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

const TEST_EMAIL_BASE = 'tests+my-identity'

describe('DELETE /api/v1/my/email-addresses/:email', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 400 when trying to remove the only email (no other auth)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const emailsResponse = await request.get('/api/v1/my/email-addresses').expect(200)
    const primaryEmail = emailsResponse.body.results.find(
      (e: { is_primary: boolean }) => e.is_primary,
    )

    await request
      .delete(`/api/v1/my/email-addresses/${encodeURIComponent(primaryEmail.email_address)}`)
      .expect(400)
  })

  it('removes a non-primary email', async () => {
    const suffix = randomSuffix()
    const secondEmail = `${TEST_EMAIL_BASE}-remove-${suffix}@voucha.ai`

    // Add second email via service
    const { token } = await createEmailVerificationToken(user.id, secondEmail)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}/verifications`)
      .send({ token })
      .expect(200)

    // Remove it
    await request
      .delete(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}`)
      .expect(204)

    const response = await request.get('/api/v1/my/email-addresses').expect(200)
    const found = response.body.results.find(
      (e: { email_address: string }) => e.email_address === secondEmail,
    )
    expect(found).toBeUndefined()
  })
})

describe('PATCH /api/v1/my/identity - use_display_name_from', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: safeUsername('test-user') })
  })
  it('updates use_display_name_from to facebook', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/identity')
      .send({ use_display_name_from: 'facebook' })
      .expect(200)

    expect(response.body.identity.use_display_name_from).toBe('facebook')
    await onceEntityListenerCompleted('processUserUpdated', user.id)
  })

  it('updates use_display_name_from to username', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/identity')
      .send({ use_display_name_from: 'username' })
      .expect(200)

    expect(response.body.identity.use_display_name_from).toBe('username')
  })

  it('returns 422 for invalid use_display_name_from', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/identity')
      .send({ use_display_name_from: 'invalid-source' })
      .expect(422)
  })
})

describe('GET /api/v1/users/:id - display_account visibility based on use_display_name_from', () => {
  let user: PrivateUser
  beforeAll(async () => {
    user = await createTestUser({ username: safeUsername('test-user') })
    const facebookUserId = `test-facebook-${randomSuffix()}`
    await insertTestOAuthAccount('facebook', facebookUserId, `facebook-${randomSuffix()}@test.com`)
    await connectOAuthAccountToUser('facebook', user.id, facebookUserId)
  })
  it('does NOT return display_account in public view when use_display_name_from is username', async () => {
    await updateUserFields(user.id, { use_display_name_from: 'username' })

    const request = createRequest()
    const response = await request.get(`/api/v1/users/${user.id}`).expect(200)

    expect(response.body.user.display_account).toBeNull()
  })

  it('DOES return display_account in public view when use_display_name_from is facebook', async () => {
    await updateUserFields(user.id, { use_display_name_from: 'facebook' })

    const request = createRequest()
    const response = await request.get(`/api/v1/users/${user.id}`).expect(200)

    expect(response.body.user.display_account).not.toBeNull()
    expect(response.body.user.display_account.id).toBe('')
    expect(response.body.user).not.toHaveProperty('individual_id')
    expect(response.body.user.roles).toEqual([])
    expect(response.body.user).not.toHaveProperty('is_agent')
    expect(response.body.user.is_official_account).toBe(false)
  })
})

describe('DELETE /api/v1/my/email-addresses/:email (with X account)', () => {
  let user: PrivateUser
  let xUserId: string

  beforeAll(async () => {
    user = await createTestUser()
    xUserId = `test-x-${createRandomString(10)}`
    await insertTestOAuthAccount('x', xUserId, null)
    await connectTestOAuthAccount('x', user.id, xUserId)
  })

  it('allows removing the only email and invalidates warmed eligibility', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await expect(hasVerifiedNonDisposableEmail(user.id)).resolves.toBe(true)

    const emailsResponse = await request.get('/api/v1/my/email-addresses').expect(200)
    const primaryEmail = emailsResponse.body.results.find(
      (e: { is_primary: boolean }) => e.is_primary,
    )

    await request
      .delete(`/api/v1/my/email-addresses/${encodeURIComponent(primaryEmail.email_address)}`)
      .expect(204)

    await expect(hasVerifiedNonDisposableEmail(user.id)).resolves.toBe(false)
  })
})
