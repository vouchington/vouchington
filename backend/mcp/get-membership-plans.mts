import type { MergedToolSource } from './create-merged-tool.mts'
import { getActiveMembershipCatalogFromPrimary } from '@services/memberships'
import type { BasicUser } from '@services/users/types'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'
import { successSchema } from '@vouchington/mcp-server/schema'
import { componentSchema } from './route-response-schema.mts'

type Catalog = Awaited<ReturnType<typeof getActiveMembershipCatalogFromPrimary>>
type ToolResult = {
  success: true
  products: Catalog
  benefit_catalog: typeof membershipBenefitCatalog
}

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      "List the public membership catalog: purchasable Plus and Pro products, billing intervals, store prices and each plan's benefits. Free is not sold. Prices use minor units and currency, or null when unset. This signed-out catalog does not show the current user's plan, entitlements or billing.",
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  meta: {
    audience: 'user',
    title: 'Get Membership Plans',
    requiredScopes: ['reference-data:read'],
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
