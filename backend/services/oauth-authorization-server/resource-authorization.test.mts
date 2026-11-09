import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { mayUserAuthorizeOAuthResource } from './resource-authorization.mts'
import { getOAuthResourceUrl } from './resources.mts'

describe('OAuth resource authorization', () => {
  it('rechecks current staff roles for admin-resource eligibility', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const administrator = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const adminResource = getOAuthResourceUrl('admin')
    const legalResource = getOAuthResourceUrl('legal')

    await expect(mayUserAuthorizeOAuthResource(moderator.id, adminResource)).resolves.toBe(true)
    await expect(mayUserAuthorizeOAuthResource(moderator.id, legalResource)).resolves.toBe(false)
    await expect(mayUserAuthorizeOAuthResource(administrator.id, legalResource)).resolves.toBe(true)
    await expect(mayUserAuthorizeOAuthResource(member.id, adminResource)).resolves.toBe(false)
    await expect(mayUserAuthorizeOAuthResource(member.id, legalResource)).resolves.toBe(false)
    await expect(
      mayUserAuthorizeOAuthResource(member.id, `${adminResource}/unregistered`),
    ).resolves.toBe(false)

    await removeTestUserRole(moderator.id, 'moderator')
    await expect(mayUserAuthorizeOAuthResource(moderator.id, adminResource)).resolves.toBe(false)
  })
})
