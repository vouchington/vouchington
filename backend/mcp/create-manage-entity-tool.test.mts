import { afterEach, describe, expect, it } from 'vitest'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

const baseConfig = {
  toolName: 'test_manage_entities',
  description: 'Test manage entities',
  addProperties: {},
  updateProperties: {},
}

describe('createManageEntityTool', () => {
  it('hydrates BasicUser callers before invoking config functions', async () => {
    const user = await createTestUser()
    const receivedUsers: PrivateUser[] = []
    const tool = createManageEntityTool({
      ...baseConfig,
      addFn: privateUser => {
        receivedUsers.push(privateUser)
        return Promise.resolve(null)
      },
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const basicUser: BasicUser = {
      __entity_type: 'user',
      account_type: null,
      id: user.id,
      roles: [],
    }

    const result = await tool.function(basicUser)({ action: 'add' })

    expect(result.success).toBe(true)
    expect(receivedUsers[0]?.id).toBe(user.id)
    expect(receivedUsers[0]?.email_address).toBe(user.email_address)
  })

  it('rejects unknown current users before dispatching', async () => {
    const tool = createManageEntityTool({
      ...baseConfig,
      addFn: () => Promise.resolve(null),
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const user: BasicUser = {
      __entity_type: 'user',
      account_type: null,
      id: randomUUID(),
      roles: [],
    }

    await expect(tool.function(user)({ action: 'add' })).rejects.toMatchObject({ status: 401 })
  })

  describe('suspension guard', () => {
    const suspendedUserIds: string[] = []

    afterEach(async () => {
      await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
    })

    it('refuses add, update, and remove from a suspended account before the mutation', async () => {
      const user = await createTestUser()
      const calls: string[] = []
      const tool = createManageEntityTool({
        ...baseConfig,
        addFn: () => {
          calls.push('add')
          return Promise.resolve(null)
        },
        updateFn: () => {
          calls.push('update')
          return Promise.resolve(null)
        },
        removeFn: () => {
          calls.push('remove')
          return Promise.resolve(null)
        },
      })
      const basicUser: BasicUser = {
        __entity_type: 'user',
        account_type: null,
        id: user.id,
        roles: [],
      }

      suspendedUserIds.push(user.id)
      await suspendTestUser(user.id)

      await expect(tool.function(basicUser)({ action: 'add' })).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
      await expect(
        tool.function(basicUser)({ action: 'update', id: 'entity-1' }),
      ).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
      await expect(
        tool.function(basicUser)({ action: 'remove', id: 'entity-1' }),
      ).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
      expect(calls).toEqual([])
    })
  })
})
