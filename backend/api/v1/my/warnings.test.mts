import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'
import { revokeUserWarning } from '@services/user-warnings'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/warnings', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let issuer: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser, issuer] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/warnings').expect(401)
  })

  it("returns the authenticated user's warnings", async () => {
    const warning = await insertTestUserWarning({
      userId: user.id,
      issuedById: issuer.id,
      reason: 'My warnings test reason',
      publicMessage: 'Please follow the rules.',
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/warnings').expect(200)

    expect(response.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: warning.id,
          user_id: user.id,
          // reason is staff-only and redacted from user-facing responses
          public_message: 'Please follow the rules.',
        }),
      ]),
    )
    // Verify the internal reason is not leaked to the warned user
    const match = (response.body.warnings as Array<{ id: string; reason?: unknown }>).find(
      w => w.id === warning.id,
    )
    expect(match?.reason).toBeUndefined()
    expect(response.body.page_info).toMatchObject({ has_next_page: false })
  })

  it('returns revocation state without exposing staff-only fields', async () => {
    const warning = await insertTestUserWarning({
      userId: user.id,
      issuedById: issuer.id,
      reason: `Revoked API warning ${crypto.randomUUID()}`,
    })
    await revokeUserWarning(issuer.id, warning.id)

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/warnings').expect(200)
    const revoked = (response.body.warnings as Array<Record<string, unknown>>).find(
      item => item.id === warning.id,
    )

    expect(revoked).toMatchObject({
      revoked_at: expect.any(String),
    })
    expect(revoked).not.toHaveProperty('reason')
    expect(revoked).not.toHaveProperty('issued_by_id')
    expect(revoked).not.toHaveProperty('revoked_by_id')
  })

  it('does not return warnings belonging to other users', async () => {
    const warning = await insertTestUserWarning({
      userId: otherUser.id,
      issuedById: issuer.id,
      reason: 'Other user only warning',
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/warnings').expect(200)

    const ids = (response.body.warnings as Array<{ id: string }>).map(w => w.id)
    expect(ids).not.toContain(warning.id)
  })

  it('supports cursor-based pagination', async () => {
    const paginationUser = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, () =>
        insertTestUserWarning({
          userId: paginationUser.id,
          issuedById: issuer.id,
          reason: 'Pagination test warning',
        }),
      ),
    )

    const request = createRequest()
    await request.authenticateAs(paginationUser)

    const firstPage = await request.get('/api/v1/my/warnings').query({ limit: 2 }).expect(200)
    expect(firstPage.body.warnings).toHaveLength(2)
    expect(firstPage.body.page_info.has_next_page).toBe(true)
    expect(firstPage.body.page_info.end_cursor).toBeTruthy()

    const secondPage = await request
      .get('/api/v1/my/warnings')
      .query({ limit: 2, after: firstPage.body.page_info.end_cursor })
      .expect(200)
    expect(secondPage.body.warnings).toHaveLength(1)
    expect(secondPage.body.page_info.has_next_page).toBe(false)
  })

  it('accepts cursor as a legacy pagination alias', async () => {
    const paginationUser = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, () =>
        insertTestUserWarning({
          userId: paginationUser.id,
          issuedById: issuer.id,
          reason: 'Legacy cursor warning',
        }),
      ),
    )

    const request = createRequest()
    await request.authenticateAs(paginationUser)

    const firstPage = await request.get('/api/v1/my/warnings').query({ limit: 2 }).expect(200)
    const secondPage = await request
      .get('/api/v1/my/warnings')
      .query({ limit: 2, cursor: firstPage.body.page_info.end_cursor })
      .expect(200)

    expect(secondPage.body.warnings).toHaveLength(1)
    expect(secondPage.body.page_info.has_next_page).toBe(false)
  })

  it('returns 400 for malformed cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/my/warnings').query({ after: 'not-a-cursor' }).expect(400)
  })
})
