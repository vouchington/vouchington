import { getIndividualCards } from '@services/individuals-households'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'

export default createGetMyEntityListTool<{ after?: string; limit?: number }>({
  toolName: 'get_my_cards',
  description: "List the current user's wallet cards.",
  properties: {
    after: { type: 'string' },
    limit: { type: 'number', description: 'Number of cards to return, from 1 to 100' },
  },
  listFn: (user, args) => getIndividualCards(user, user, args),
  meta: {
    audience: 'user',
    title: 'Get My Cards',
    requiredScopes: ['cards:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/cards' }],
  },
})
