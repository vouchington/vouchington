import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

const ENTITY_ID = crypto.randomUUID()

// Every tool of the community list item, list membership and membership plan families, the scope it needs and a valid call.
describe('community list item, list membership and membership plan read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['communities:read', 'lists:read', 'reference-data:read'],
    tools: [
      [
        'read_community',
        'communities:read',
        optionArgs('list_items', { community_id: 'some', item_type: 'post' }),
      ],
      [
        'read_community',
        'communities:read',
        optionArgs('list_item_counts', { community_id: 'some' }),
      ],
      [
        'read_my_lists',
        'lists:read',
        optionArgs('containing', { item_type: 'post', entity_id: ENTITY_ID }),
      ],
      ['read_reference_data', 'reference-data:read', optionArgs('membership_plans', {})],
    ],
    pagedTools: [['read_community', 'list_items']],
    requiredArguments: [
      ['read_community', optionArgs('list_items', { community_id: 'some' })],
      ['read_community', optionArgs('list_item_counts', {})],
      ['read_my_lists', optionArgs('containing', { item_type: 'post' })],
    ],
  })
})
