import { communityModerationReadAddRoutes } from './community-moderation-routes-read-add.mts'
import { communityModerationUpdateRemoveRoutes } from './community-moderation-routes-update-remove.mts'

/** REST routes approved for the four moderator tools in issue #2546. */
export const communityModerationRoutes = [
  ...communityModerationReadAddRoutes,
  ...communityModerationUpdateRemoveRoutes,
] as const
