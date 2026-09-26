import { getIndividualRewardsProgramStatuses } from '@services/individuals-households'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'

export default createGetMyEntityListTool<{ after?: string; limit?: number }>({
  toolName: 'get_my_rewards_statuses',
  description: "List the current user's rewards program statuses.",
  properties: {
    after: { type: 'string', description: 'Opaque cursor from the previous status page' },
    limit: { type: 'number', description: 'Number of statuses to return, from 1 to 100' },
  },
  listFn: (user, args) => getIndividualRewardsProgramStatuses(user, user, args),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Rewards Statuses',
    requiredScopes: { mcp: ['rewards-statuses:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/rewards-program-statuses' }],
  },
})
