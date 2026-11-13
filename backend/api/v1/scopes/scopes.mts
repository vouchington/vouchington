import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { listScopeCatalog } from '@modules/scopes'
import { listScopeAudiencePolicies } from '@services/mcp-tools'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'

// GET /api/v1/scopes — the canonical scope catalogue that API-key and OAuth app pickers render.
app.route('/api/v1/scopes').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/scopes')
  setAnonymousPublicCacheHeaders(ctx, currentUser)
  ctx.json(
    apiResponse('GET:/api/v1/scopes', {
      scopes: listScopeCatalog(),
      audiences: listScopeAudiencePolicies(),
    }),
  )
})
