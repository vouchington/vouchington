import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import { markRead, markUnread } from '@services/read-states'
import { getPostByAny } from '@services/posts/get'
import { canViewPost } from '@services/posts/check-privacy-access'

async function assertPostAccess(
  ctx: Context,
  id: string,
  currentUser: Awaited<ReturnType<typeof requireAuth>>,
) {
  const post = await getPostByAny(id)
  ctx.assert(post && !post.deleted_at, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, post!), 404, 'Post not found')
}

app
  .route('/api/v1/posts/:id/read')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PUT:/api/v1/posts/:id/read')
    const id = validateUUIDParam(ctx, 'id')
    await assertPostAccess(ctx, id, currentUser)
    await markRead(currentUser.id, 'post', id)
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:id/read')
    const id = validateUUIDParam(ctx, 'id')
    await assertPostAccess(ctx, id, currentUser)
    await markUnread(currentUser.id, 'post', id)
    ctx.setStatus(204)
  })
