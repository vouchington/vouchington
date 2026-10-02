import { describe } from 'vitest'
import { registerMcpReadToolGatingTests } from '@voucha/test-helpers/mcp-read-tool-gating'

const ENTITY_ID = crypto.randomUUID()

// Every tool of the community list item, list membership and membership plan families, the scope it needs and a valid call.
describe('community list item, list membership and membership plan read tool gating', () => {
  registerMcpReadToolGatingTests({
    scopes: ['communities:read', 'lists:read', 'reference-data:read'],
    tools: [
      ['get_community_list_items', 'communities:read', { community_id: 'some', item_type: 'post' }],
      ['get_community_list_item_counts', 'communities:read', { community_id: 'some' }],
      ['get_my_lists_containing', 'lists:read', { item_type: 'post', entity_id: ENTITY_ID }],
      ['get_membership_plans', 'reference-data:read', {}],
    ],
    pagedTools: ['get_community_list_items'],
    requiredArguments: [
      ['get_community_list_items', { community_id: 'some' }],
      ['get_community_list_item_counts', {}],
      ['get_my_lists_containing', { item_type: 'post' }],
    ],
  })
})
