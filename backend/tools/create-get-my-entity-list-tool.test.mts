import { describe, expect, it } from 'vitest'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { routeResponseSchema, successResultSchema } from './route-response-schema.mts'
import type { ToolMeta } from '@services/openai-agents/tool-types'

const LIST_META = {
  surfaces: ['mcp'],
  title: 'Get My Test Entities',
  requiredScopes: { mcp: ['cards:read'] },
  annotations: { readOnlyHint: true },
} satisfies Omit<ToolMeta, 'api' | 'outputSchema'>

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

  it('declares no output schema for a tool without API metadata', () => {
    const tool = createGetMyEntityListTool({
      toolName: 'get_my_test_entities',
      description: 'List test entities',
      properties: {},
      listFn: () => Promise.resolve([]),
    })

    expect(tool.meta).toBeUndefined()
  })

  it('derives the output schema from the one REST endpoint it names', () => {
    const tool = createGetMyEntityListTool({
      toolName: 'get_my_test_entities',
      description: 'List test entities',
      properties: {},
      listFn: () => Promise.resolve([]),
      meta: { ...LIST_META, api: [{ method: 'GET', path: '/api/v1/my/cards' }] },
    })

    expect(tool.meta?.outputSchema).toEqual(
      successResultSchema(routeResponseSchema({ method: 'GET', path: '/api/v1/my/cards' })),
    )
    expect(tool.meta?.outputSchema?.['required']).toEqual(['success', 'result'])
  })

  it.each([
    ['no REST endpoint', null],
    ['an empty endpoint list', []],
    [
      'more than one REST endpoint',
      [
        { method: 'GET', path: '/api/v1/my/cards' },
        { method: 'GET', path: '/api/v1/my/spending-categories' },
      ] as const,
    ],
  ])('rejects a tool that names %s', (_case, api) => {
    expect(() =>
      createGetMyEntityListTool({
        toolName: 'get_my_test_entities',
        description: 'List test entities',
        properties: {},
        listFn: () => Promise.resolve([]),
        meta: { ...LIST_META, api },
      }),
    ).toThrow('get_my_test_entities must name exactly one REST endpoint')
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
