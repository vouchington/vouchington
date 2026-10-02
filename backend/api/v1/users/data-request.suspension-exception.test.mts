import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { getLatestDataRequest } from '@services/account-data-requests'

describe('suspended data-export exception', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('allows a suspended user to request only their own export', async () => {
    const owner = await createTestUser({ extraRoles: ['administrator'] })
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    suspendedUserIds.push(owner.id)
    await suspendTestUser(owner.id)

    const selfRequest = await request.post(`/api/v1/users/${owner.id}/data-request`).expect(201)
    expect(selfRequest.body.status).toBe('pending')
    expect(await getLatestDataRequest(owner.id, owner.id)).toMatchObject({
      id: selfRequest.body.id,
      user_id: owner.id,
      requested_by_id: owner.id,
    })

    const crossAccount = await request.post(`/api/v1/users/${other.id}/data-request`)
    expect(crossAccount.status).toBe(403)
    expect(crossAccount.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await getLatestDataRequest(other.id, owner.id)).toBeNull()
  })
})
