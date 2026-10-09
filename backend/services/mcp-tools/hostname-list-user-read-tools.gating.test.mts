import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

const LIST_ID = crypto.randomUUID()

// Every tool of the hostname, list and user read families, the scope it needs and a valid call.
describe('hostname, list and user read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['hostnames:read', 'users:read', 'lists:read'],
    tools: [
      ['read_hostnames', 'hostnames:read', optionArgs('search', {})],
      ['read_hostnames', 'hostnames:read', optionArgs('top', {})],
      ['read_users', 'users:read', optionArgs('details', { user_id: 'some-user' })],
      ['read_users', 'users:read', optionArgs('search', { q: 'some' })],
      ['read_my_lists', 'lists:read', optionArgs('list', {})],
      ['read_my_lists', 'lists:read', optionArgs('get', { list_id: LIST_ID })],
      ['read_my_lists', 'lists:read', optionArgs('items', { list_id: LIST_ID })],
    ],
    pagedTools: [
      ['read_hostnames', 'search'],
      ['read_hostnames', 'top'],
      ['read_users', 'search'],
      ['read_my_lists', 'list'],
      ['read_my_lists', 'items'],
    ],
    requiredArguments: [
      ['read_users', optionArgs('details', { q: 'some' })],
      ['read_users', optionArgs('search', {})],
      ['read_my_lists', optionArgs('get', {})],
      ['read_my_lists', optionArgs('items', {})],
    ],
  })
})
