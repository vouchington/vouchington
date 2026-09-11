import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  restoreUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createList, getList, updateList, softDeleteList, searchUserLists } from '../lists.mts'

describe('lists service', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('createList', () => {
    it('creates a list with default private visibility', async () => {
      const name = `Test List ${createRandomString(8)}`
      const list = await createList(user.id, { name })
      expect(list.__entity_type).toBe('list')
      expect(list.owner_user_id).toBe(user.id)
      expect(list.name).toBe(name)
      expect(list.visibility).toBe('private')
      expect(list.description).toBeNull()
      expect(list.removed_at).toBeNull()
    })

    it('creates a list with specified visibility and description', async () => {
      const name = `Public List ${createRandomString(8)}`
      const description = 'A public list'
      const list = await createList(user.id, { name, description, visibility: 'public' })
      expect(list.visibility).toBe('public')
      expect(list.description).toBe(description)
    })

    it('rejects a deleted owner', async () => {
      const deletedOwner = await createTestUser()
      try {
        await softDeleteUser(deletedOwner.id)
        await expect(
          createList(deletedOwner.id, { name: 'Deleted owner list' }),
        ).rejects.toMatchObject({ code: '23514' })
      } finally {
        await restoreUser(deletedOwner.id)
      }
    })
  })

  describe('getList', () => {
    it('returns null for non-existent list', async () => {
      const result = await getList('00000000-0000-7000-8000-000000000000')
      expect(result).toBeNull()
    })

    it('returns a list by id', async () => {
      const list = await createList(user.id, { name: `Get Test ${createRandomString(8)}` })
      const found = await getList(list.id)
      expect(found?.id).toBe(list.id)
    })

    it('returns null for soft-deleted list', async () => {
      const list = await createList(user.id, { name: `Delete Test ${createRandomString(8)}` })
      await softDeleteList(user.id, list.id)
      const found = await getList(list.id)
      expect(found).toBeNull()
    })
  })

  describe('updateList', () => {
    it('updates list name', async () => {
      const list = await createList(user.id, { name: `Update Test ${createRandomString(8)}` })
      const newName = `Updated ${createRandomString(8)}`
      const updated = await updateList(user.id, list.id, { name: newName })
      expect(updated.name).toBe(newName)
    })

    it('updates list visibility', async () => {
      const list = await createList(user.id, { name: `Visibility Test ${createRandomString(8)}` })
      const updated = await updateList(user.id, list.id, { visibility: 'public' })
      expect(updated.visibility).toBe('public')
    })

    it('rejects updates from a deleted owner', async () => {
      const deletedOwner = await createTestUser()
      const list = await createList(deletedOwner.id, { name: 'Deleted owner update' })
      try {
        await softDeleteUser(deletedOwner.id)
        await expect(
          updateList(deletedOwner.id, list.id, { name: 'Must not update' }),
        ).rejects.toMatchObject({ code: '23514' })
      } finally {
        await restoreUser(deletedOwner.id)
      }
    })

    it('throws 404 when list not found or not owned', async () => {
      await expect(
        updateList(user.id, '00000000-0000-7000-8000-000000000000', { name: 'x' }),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('softDeleteList', () => {
    it('soft-deletes a list', async () => {
      const list = await createList(user.id, { name: `Soft Delete ${createRandomString(8)}` })
      await softDeleteList(user.id, list.id)
      expect(await getList(list.id)).toBeNull()
      await expect(softDeleteList(user.id, list.id)).rejects.toMatchObject({ status: 404 })
    })

    it('throws 404 when list not found', async () => {
      await expect(
        softDeleteList(user.id, '00000000-0000-7000-8000-000000000000'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('searchUserLists', () => {
    it('returns lists for a user', async () => {
      const listUser = await createTestUser()
      const name = `Search Test ${createRandomString(8)}`
      await createList(listUser.id, { name })

      const { results } = await searchUserLists(listUser.id)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0]?.owner_user_id).toBe(listUser.id)
    })

    it('returns page_info', async () => {
      const { page_info } = await searchUserLists(user.id)
      expect(page_info).toHaveProperty('has_next_page')
      expect(page_info).toHaveProperty('start_cursor')
      expect(page_info).toHaveProperty('end_cursor')
    })

    it('excludes soft-deleted lists', async () => {
      const listUser = await createTestUser()
      const list = await createList(listUser.id, { name: `To Delete ${createRandomString(8)}` })
      await softDeleteList(listUser.id, list.id)

      const { results } = await searchUserLists(listUser.id)
      const found = results.find(l => l.id === list.id)
      expect(found).toBeUndefined()
    })
  })
})
