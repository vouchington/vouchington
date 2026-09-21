import { describe, expect, it } from 'vitest'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { BasicUser, PrivateUser } from '@services/users/types'

describe('createGetMyEntityListTool', () => {
  it('creates a read-only list tool with the configured pagination schema', () => {
    const tool = createGetMyEntityListTool({
      toolName: 'get_my_test_entities',
      description: 'List test entities',
      properties: { after: { type: 'string' }, limit: { type: 'number' } },
      listFn: () => Promise.resolve([]),
    })

    expect(tool.schema).toMatchObject({
      name: 'get_my_test_entities',
      parameters: { properties: { after: { type: 'string' }, limit: { type: 'number' } } },
    })
  })

  it('hydrates a basic user before listing', async () => {
    const user = await createTestUser()
    const receivedUsers: PrivateUser[] = []
    const tool = createGetMyEntityListTool({
      toolName: 'get_my_test_entities',
      description: 'List test entities',
      properties: {},
      listFn: privateUser => {
        receivedUsers.push(privateUser)
        return Promise.resolve([])
      },
    })
    const basicUser: BasicUser = { __entity_type: 'user', id: user.id, roles: [] }

    await expect(tool.function(basicUser)({})).resolves.toEqual({ success: true, result: [] })
    expect(receivedUsers[0]?.email_address).toBe(user.email_address)
  })
})
