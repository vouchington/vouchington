import { describe, expect, it } from 'vitest'
import { createTestUser, restoreUser, softDeleteUser } from '@voucha/test-helpers'
import { createDataRequest } from './create.mts'

describe('createDataRequest active-user fence', () => {
  it('does not create export work after account deletion', async () => {
    const user = await createTestUser()
    try {
      await softDeleteUser(user.id)
      await expect(createDataRequest(user.id)).rejects.toMatchObject({ code: '23514' })
    } finally {
      await restoreUser(user.id)
    }
  })
})
