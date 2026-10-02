import { getActiveMembershipCatalogFromPrimary } from '@services/memberships'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'
import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type Catalog = Awaited<ReturnType<typeof getActiveMembershipCatalogFromPrimary>>
type ToolResult = {
  success: true
  products: Catalog
  benefit_catalog: typeof membershipBenefitCatalog
}

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_membership_plans',
    type: 'function',
    description:
      'List the membership plans Voucha sells and what each plan includes. products are the purchasable plans (free is not sold): each has a plan (plus or pro), a billing interval and, per store that sells it, the store product reference and its price (an amount in minor units and a currency, or null when none is set). benefit_catalog is the versioned list of benefits by group, with the value each plan gets (an access level, a yes or no, a quantity or a tier), for comparing plans. This is the same public catalog a signed-out visitor sees. It says nothing about the current user: it is not their plan, entitlements or billing.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Membership Plans',
    requiredScopes: { mcp: ['reference-data:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/memberships/plans' }],
    outputSchema: successSchema({
      products: { type: 'array', items: componentSchema('MembershipCatalogProduct') },
      benefit_catalog: componentSchema('MembershipBenefitCatalog'),
    }),
  },
  function: (_currentUser: BasicUser) => async (): Promise<ToolResult> => ({
    success: true,
    products: await getActiveMembershipCatalogFromPrimary(),
    benefit_catalog: membershipBenefitCatalog,
  }),
}

export default tool
