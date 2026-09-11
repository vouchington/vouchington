import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getActiveMembershipCatalogFromPrimary } from '@services/memberships'
import { membershipBenefitCatalog } from '@services/memberships/benefit-catalog'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/memberships/plans').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/memberships/plans')
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const products = await getActiveMembershipCatalogFromPrimary()
  ctx.json({ products, benefit_catalog: membershipBenefitCatalog })
})
