import type { Context } from '@jongleberry/api-server'
import { getCommunity } from '@services/communities'

export async function getCommunityOrThrow(ctx: Context, idOrSlug: string) {
  const community = await getCommunity(idOrSlug)
  ctx.assert(community, 404, 'Community not found')
  return community
}
