import { getUserFinancialProfile } from '@services/user-financial-profiles'
import { requirePrivateToolUser } from './private-user.mts'
import { componentSchema, successResultSchema } from './route-response-schema.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const API = { method: 'GET', path: '/api/v1/my/financial-profile' } as const

const tool: Tool<
  Record<string, never>,
  { success: true; result: { financial_profile: unknown | null } }
> = {
  schema: {
    name: 'get_my_financial_profile',
    type: 'function',
    description:
      "Read the current user's credit score range, stated income range, total credit limit and years of credit history.",
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get My Financial Profile',
    requiredScopes: { mcp: ['financial-profile:read'] },
    annotations: { readOnlyHint: true },
    api: [API],
    outputSchema: successResultSchema({
      type: 'object',
      properties: {
        financial_profile: { anyOf: [componentSchema('UserFinancialProfile'), { type: 'null' }] },
      },
      required: ['financial_profile'],
      additionalProperties: false,
    }),
  },
  function: currentUser => async () => {
    const user = await requirePrivateToolUser(currentUser)
    return { success: true, result: { financial_profile: await getUserFinancialProfile(user.id) } }
  },
}

export default tool
