import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { listScopeCatalog } from '@modules/scopes'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { apiResponse } from '../../response-contract.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'

// GET /api/v1/scopes — the canonical scope catalogue that API-key and OAuth app pickers render.
app.route('/api/v1/scopes').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/scopes')
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }
  ctx.json(apiResponse('GET:/api/v1/scopes', { scopes: listScopeCatalog() }))
})
