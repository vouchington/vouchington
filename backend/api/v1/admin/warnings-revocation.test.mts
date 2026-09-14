import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'
import { revokeUserWarning } from '@services/user-warnings'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'

describe('GET /api/v1/admin/warnings revocation details', () => {
  it('retains the revoking staff id in the internal warning response', async () => {
    const [staffSeed, warnedUser] = await Promise.all([createTestUser(), createTestUser()])
    await addUserRole(staffSeed.id, 'moderator')
    const staff = (await getPrivateUserByAny(staffSeed.id))!
    const warning = await insertTestUserWarning({
      userId: warnedUser.id,
      issuedById: staff.id,
      reason: 'Admin revoked warning',
    })
    await revokeUserWarning(staff.id, warning.id)

    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request
      .get('/api/v1/admin/warnings')
      .query({ userId: warnedUser.id })
      .expect(200)
    const revoked = response.body.warnings.find((item: { id: string }) => item.id === warning.id)

    expect(revoked).toMatchObject({
      revoked_at: expect.any(String),
      revoked_by_id: staff.id,
    })
  })
})
