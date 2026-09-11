import type { Context } from '@jongleberry/api-server'
import { createConversation } from '@services/conversations-messages/create'
import { assertNotSuspended } from '@services/users'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/conversations').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/conversations')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  // Chat composer callers intentionally omit `title` so /my/conversations/:id/title can later generate one; other callers may pass a title here.
  const title = typeof body.title === 'string' ? body.title : ''

  const conversation = await createConversation(currentUser.id, title)

  ctx.json({ conversation })
})
