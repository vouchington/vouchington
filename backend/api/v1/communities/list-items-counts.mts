import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { loadCommunityForViewer, getCommunityListItemCounts } from '@services/communities'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/communities/:idOrSlug/list-items/counts').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/list-items/counts',
  )

  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/list-items/counts', {
    path: ctx.params,
  })
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community } = await loadCommunityForViewer(currentUser, idOrSlug)

  const counts = await getCommunityListItemCounts(community.id, { currentUser })

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json(counts)
})
