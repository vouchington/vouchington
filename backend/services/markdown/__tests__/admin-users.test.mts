import { describe, expect, it } from 'vitest'
import { getAdminUserIdsFromEntities, getAdminUserIdsFromPosts } from '../admin-users.mts'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'

describe('markdown admin user lookup', () => {
  it('ignores fixture-style user ids before querying admin roles', async () => {
    await expect(getAdminUserIdsFromEntities([{ created_by: { id: 'user-1' } }])).resolves.toEqual(
      new Set(),
    )
    await expect(getAdminUserIdsFromPosts([{ created_by_id: 'user-1' }])).resolves.toEqual(
      new Set(),
    )
  })

  it('does not trust soft-deleted admin authors', async () => {
    const admin = await createTestUser({ administrator: true })
    if (!admin) throw new Error('Failed to create admin user')

    await expect(getAdminUserIdsFromEntities([{ created_by: { id: admin.id } }])).resolves.toEqual(
      new Set([admin.id]),
    )

    await softDeleteUser(admin.id)

    await expect(getAdminUserIdsFromEntities([{ created_by: { id: admin.id } }])).resolves.toEqual(
      new Set(),
    )
    await expect(getAdminUserIdsFromPosts([{ created_by_id: admin.id }])).resolves.toEqual(
      new Set(),
    )
  })
})
