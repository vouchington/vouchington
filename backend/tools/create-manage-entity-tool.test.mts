import { describe, expect, it } from 'vitest'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('createManageEntityTool', () => {
  it('passes typed list-only arguments to the list implementation', async () => {
    const user = await createTestUser()
    const received: Array<{ action: 'list'; after?: string; limit?: number }> = []
    const tool = createManageEntityTool({
      toolName: 'test_paginated_entities',
      description: 'Test paginated entities',
      addProperties: {},
      updateProperties: {},
      listProperties: { after: { type: 'string' }, limit: { type: 'number' } },
      listFn: (_privateUser, args: { action: 'list'; after?: string; limit?: number }) => {
        received.push(args)
        return Promise.resolve([])
      },
      addFn: () => Promise.resolve(null),
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })

    await tool.function(user)({ action: 'list', after: 'cursor', limit: 5 })

    expect(received).toEqual([{ action: 'list', after: 'cursor', limit: 5 }])
    expect(tool.schema.parameters).toMatchObject({
      properties: { after: { type: 'string' }, limit: { type: 'number' } },
    })
  })
  it('hydrates BasicUser callers before invoking config functions', async () => {
    const user = await createTestUser()
    const receivedUsers: PrivateUser[] = []
    const tool = createManageEntityTool({
      toolName: 'test_manage_entities',
      description: 'Test manage entities',
      addProperties: {},
      updateProperties: {},
      listFn: privateUser => {
        receivedUsers.push(privateUser)
        return Promise.resolve([])
      },
      addFn: () => Promise.resolve(null),
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const basicUser: BasicUser = { __entity_type: 'user', id: user.id, roles: [] }

    const result = await tool.function(basicUser)({ action: 'list' })

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
      listFn: () => {
        calls.push('list')
        return Promise.resolve([])
      },
      addFn: () => Promise.resolve(null),
      updateFn: () => Promise.resolve(null),
      removeFn: () => Promise.resolve(null),
    })
    const user: BasicUser = {
      __entity_type: 'user',
      id: randomUUID(),
      roles: [],
    }

    await expect(tool.function(user)({ action: 'list' })).rejects.toMatchObject({ status: 401 })
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
      listFn: () => {
        calls.push('list')
        return Promise.resolve([])
      },
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
      listFn: () => Promise.resolve([]),
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
