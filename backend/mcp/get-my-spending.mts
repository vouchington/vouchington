import { getHouseholdSpendingCategoriesByUserId } from '@services/individuals-households'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'

export default createGetMyEntityListTool<{ after?: string; limit?: number }>({
  toolName: 'get_my_spending',
  description: "List the current user's spending categories.",
  properties: {
    after: { type: 'string' },
    limit: { type: 'number', minimum: 1, maximum: 100, description: 'Entries per list page' },
  },
  listFn: (user, args) => getHouseholdSpendingCategoriesByUserId(user, user, args),
  meta: {
    audience: 'user',
    title: 'Get My Spending',
    requiredScopes: ['spending:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/spending-categories' }],
  },
})
