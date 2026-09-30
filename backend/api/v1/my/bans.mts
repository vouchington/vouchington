import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryInteger, queryString } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { listUserActiveCommunityBans } from '@services/communities'

// `limit` and `after` are read leniently: a `limit` that is not a positive integer falls back to 25,
// a larger one is clamped to 100, and a repeated `after` is ignored. The handler validates the
// values it settled on, so this contract publishes the accepted shape without rejecting any input.
const bansQuery = defineQueryContract({
  after: queryString({ description: 'Opaque cursor from page_info.end_cursor.' }),
  limit: queryInteger(
    { minimum: 1, maximum: 100, default: 25 },
    { description: 'Larger values are clamped to 100; other invalid values use 25.' },
  ),
})

// GET /api/v1/my/bans — list the current user's active community bans
app.route('/api/v1/my/bans').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/bans', bansQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/bans')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  validateRequestContract(ctx, 'GET:/api/v1/my/bans', {
    query: { limit, ...(after === undefined ? {} : { after }) },
  })

  const { results, page_info } = await listUserActiveCommunityBans(currentUser.id, {
    limit,
    after,
  })

  const bans = results.map(ban => ({
    id: ban.id,
    community_id: ban.community_id,
    community_slug: ban.community_slug,
    user_id: ban.user_id,
    reason: ban.reason,
    expires_at: ban.expires_at,
    created_at: ban.created_at,
    updated_at: ban.updated_at,
    lifted_at: ban.lifted_at,
    __entity_type: 'community_ban' as const,
  }))

  ctx.json({ bans, page_info })
})
