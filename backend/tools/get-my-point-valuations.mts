import { getIndividualRewardsProgramPointValuations } from '@services/individuals-households'
import { createGetMyEntityListTool } from './create-get-my-entity-list-tool.mts'

export default createGetMyEntityListTool<{ after?: string; limit?: number }>({
  toolName: 'get_my_point_valuations',
  description: "List the current user's rewards program point valuations.",
  properties: {
    after: { type: 'string', description: 'Opaque cursor from the previous page' },
    limit: { type: 'number', description: 'Number of valuations to return, from 1 to 100' },
  },
  listFn: (user, args) => getIndividualRewardsProgramPointValuations(user, user, args),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['point-valuations:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/rewards-program-point-valuations' }],
  },
})
