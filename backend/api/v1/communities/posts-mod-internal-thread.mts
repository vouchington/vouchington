import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { assertNotSuspended, isModerationStaff } from '@services/users'
import { openModInternalThread } from '@services/moderation-threads'

app
  .route('/api/v1/communities/:idOrSlug/posts/:postId/mod-internal-thread')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/posts/:postId/mod-internal-thread',
    )
    assertNotSuspended(currentUser)
    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const postId = validateUUIDParam(ctx, 'postId')
    const isStaff = isModerationStaff(currentUser)
    const community = isStaff
      ? await getCommunityOrThrow(idOrSlug)
      : (await loadCommunityForModerator(currentUser, idOrSlug)).community

    const conversation = await openModInternalThread(currentUser.id, {
      communityId: community.id,
      postId,
    })

    ctx.json({ conversation })
  })
