import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'
import { isCommunityRootPostType, type CommunityRootPostType } from '@services/communities'

export function parseEligiblePostType(
  ctx: Context,
  currentUser: PrivateUser | null,
): CommunityRootPostType | undefined {
  const eligiblePostTypeParam = ctx.query.eligible_post_type as string | undefined
  if (eligiblePostTypeParam === undefined) return undefined
  ctx.assert(
    isCommunityRootPostType(eligiblePostTypeParam),
    400,
    'Invalid eligible_post_type value',
  )
  ctx.assert(currentUser, 401, 'Unauthorized')
  return eligiblePostTypeParam
}
