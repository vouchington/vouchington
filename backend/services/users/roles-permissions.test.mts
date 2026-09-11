import { it, expect, describe, beforeAll } from 'vitest'
import { countUserRoleAssignments, createTestUser } from '@voucha/test-helpers'
import { addUserRole } from './roles-permissions.mts'
import type { PrivateUser } from '@services/users/types'

describe('roles-permissions', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('addUserRole', () => {
    it('is idempotent for the same user and role', async () => {
      await addUserRole(user.id, 'administrator')
      await addUserRole(user.id, 'administrator')

      const count = await countUserRoleAssignments(user.id, 'administrator')
      expect(count).toBe(1)
    })
  })
})
