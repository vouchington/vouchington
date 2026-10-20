import { afterEach, describe, expect, it } from 'vitest'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { BasicUser } from '@services/users/types'
import { createManageEntityTool } from './create-manage-entity-tool.mts'

describe('createManageEntityTool suspension guard', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('refuses add, update, and remove from a suspended account before the mutation', async () => {
    const user = await createTestUser()
    const calls: string[] = []
    const tool = createManageEntityTool({
      toolName: 'test_manage_entities',
      description: 'Test manage entities',
      addProperties: {},
      updateProperties: {},
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
