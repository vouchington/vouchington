import { describe, expect, it } from 'vitest'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('createManageEntityTool', () => {
  it('hydrates BasicUser callers before invoking config functions', async () => {
    const user = await createTestUser()
    const receivedUsers: PrivateUser[] = []
    const tool = createManageEntityTool({
      toolName: 'test_manage_entities',
      description: 'Test manage entities',
      addProperties: {},
      updateProperties: {},
      addFn: privateUser => {
        receivedUsers.push(privateUser)
        return Promise.resolve(null)
      },
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const basicUser: BasicUser = { __entity_type: 'user', id: user.id, roles: [] }

    const result = await tool.function(basicUser)({ action: 'add' })

    expect(result.success).toBe(true)
    expect(receivedUsers[0]?.id).toBe(user.id)
    expect(receivedUsers[0]?.email_address).toBe(user.email_address)
  })

  it('rejects unknown current users before dispatching', async () => {
    const calls: string[] = []
    const tool = createManageEntityTool({
      toolName: 'test_manage_entities',
      description: 'Test manage entities',
      addProperties: {},
      updateProperties: {},
      addFn: () => Promise.resolve(null),
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const user: BasicUser = {
      __entity_type: 'user',
      id: randomUUID(),
      roles: [],
    }

    await expect(tool.function(user)({ action: 'add' })).rejects.toMatchObject({ status: 401 })
    expect(calls).toEqual([])
  })

  it('rejects unsupported actions without falling through to remove', async () => {
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

    await expect(
      tool.function(user)({ action: 'destroy', id: 'entity-1' } as never),
    ).rejects.toThrow('Unsupported action: destroy')
    expect(calls).toEqual([])
  })

  it('requires id for update and remove actions', async () => {
    const user = await createTestUser()
    const calls: string[] = []
    const tool = createManageEntityTool({
      toolName: 'test_manage_entities',
      description: 'Test manage entities',
      addProperties: {},
      updateProperties: {},
      addFn: () => Promise.resolve(null),
      updateFn: () => {
        calls.push('update')
        return Promise.resolve(null)
      },
      removeFn: () => {
        calls.push('remove')
        return Promise.resolve(null)
      },
    })

    await expect(tool.function(user)({ action: 'update' } as never)).rejects.toMatchObject({
      status: 422,
    })
    await expect(tool.function(user)({ action: 'remove' } as never)).rejects.toMatchObject({
      status: 422,
    })
    expect(calls).toEqual([])
  })
})
