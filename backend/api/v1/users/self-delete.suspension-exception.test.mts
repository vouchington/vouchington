import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { getPrivateUserByIdOrSlug } from '@services/users'

describe('suspended account deletion exception', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('allows self-deletion but does not allow deleting another account', async () => {
    const owner = await createTestUser({ extraRoles: ['administrator'] })
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)
    suspendedUserIds.push(owner.id)
    await suspendTestUser(owner.id)

    const crossAccount = await request.delete(`/api/v1/users/${target.id}`)
    expect(crossAccount.status).toBe(403)
    expect(crossAccount.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await getPrivateUserByIdOrSlug(target.id)).not.toBeNull()

    const selfDelete = await request.delete(`/api/v1/users/${owner.id}`).expect(202)
    expect(selfDelete.body.logout).toBe(true)
    expect(await getPrivateUserByIdOrSlug(owner.id)).toBeNull()
  })
})
