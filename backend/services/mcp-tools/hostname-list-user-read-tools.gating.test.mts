import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

const LIST_ID = crypto.randomUUID()

// Every tool of the hostname, list and user read families, the scope it needs and a valid call.
describe('hostname, list and user read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['hostnames:read', 'users:read', 'lists:read'],
    tools: [
      ['search_hostnames', 'hostnames:read', {}],
      ['get_top_hostnames', 'hostnames:read', {}],
      ['get_user', 'users:read', { user_id: 'some-user' }],
      ['search_users', 'users:read', { q: 'some' }],
      ['get_my_lists', 'lists:read', {}],
      ['get_list', 'lists:read', { list_id: LIST_ID }],
      ['get_list_items', 'lists:read', { list_id: LIST_ID }],
    ],
    pagedTools: [
      'search_hostnames',
      'get_top_hostnames',
      'search_users',
      'get_my_lists',
      'get_list_items',
    ],
    requiredArguments: [
      ['get_user', { q: 'some' }],
      ['search_users', {}],
      ['get_list', {}],
      ['get_list_items', {}],
    ],
  })
})
