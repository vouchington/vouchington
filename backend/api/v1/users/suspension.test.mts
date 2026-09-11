import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, safeUsername, suspendTestUser } from '@voucha/test-helpers'
import { CONFLICT } from '@modules/on-error/error-codes'

describe('PUT /api/v1/users/:userId/suspension', () => {
  it('returns 401 for unauthenticated', async () => {
    const target = await createTestUser({ username: safeUsername('susp-api-anon') })
    const request = createRequest()
    await request.put(`/api/v1/users/${target.id}/suspension`).expect(401)
  })

  it('returns 403 for non-admin', async () => {
    const user = await createTestUser({ username: safeUsername('susp-api-nonadmin') })
    const target = await createTestUser({ username: safeUsername('susp-api-target1') })
    const request = createRequest()
    await request.authenticateAs(user!)
    await request.put(`/api/v1/users/${target.id}/suspension`).expect(403)
  })

  it('suspends a user and returns the updated user with suspended_at set', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('susp-api-target2') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.put(`/api/v1/users/${target.id}/suspension`).send({}).expect(200)

    expect(response.body.user.id).toBe(target.id)
    expect(response.body.user.suspended_at).toBeTruthy()
  })

  it('accepts an optional reason', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('susp-api-reason') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .put(`/api/v1/users/${target.id}/suspension`)
      .send({ reason: 'spamming links' })
      .expect(200)

    expect(response.body.user.suspended_reason).toBe('spamming links')
  })

  it('returns 409 for already-suspended user', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('susp-api-already') })
    await suspendTestUser(target.id)

    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.put(`/api/v1/users/${target.id}/suspension`).send({}).expect(409)

    expect(response.body.code).toBe(CONFLICT)
  })
})

describe('DELETE /api/v1/users/:userId/suspension', () => {
  it('unsuspends a user and returns the updated user with suspended_at null', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('unsusp-api-clear') })
    await suspendTestUser(target.id)

    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.delete(`/api/v1/users/${target.id}/suspension`).expect(200)

    expect(response.body.user.id).toBe(target.id)
    expect(response.body.user.suspended_at).toBeNull()
  })

  it('returns 403 for non-admin', async () => {
    const user = await createTestUser({ username: safeUsername('unsusp-api-nonadmin') })
    const target = await createTestUser({ username: safeUsername('unsusp-api-target') })
    await suspendTestUser(target.id)

    const request = createRequest()
    await request.authenticateAs(user!)
    await request.delete(`/api/v1/users/${target.id}/suspension`).expect(403)
  })

  it('returns 409 for non-suspended user', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('unsusp-api-notsusp') })

    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.delete(`/api/v1/users/${target.id}/suspension`).expect(409)

    expect(response.body.code).toBe(CONFLICT)
  })
})
