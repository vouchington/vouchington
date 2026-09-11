import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { listUserActiveCommunityBans } from '@services/communities'

// GET /api/v1/my/bans — list the current user's active community bans
app.route('/api/v1/my/bans').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/bans')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined

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
