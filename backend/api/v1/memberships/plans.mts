import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getActiveMembershipCatalogFromPrimary } from '@services/memberships'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'

app.route('/api/v1/memberships/plans').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/memberships/plans')
  setAnonymousPublicCacheHeaders(ctx, currentUser)

  const products = await getActiveMembershipCatalogFromPrimary()
  ctx.json({ products, benefit_catalog: membershipBenefitCatalog })
})
