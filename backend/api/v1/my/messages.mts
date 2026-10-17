import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  listMyMessageConversations,
  createMyMessageConversation,
} from '@services/messaging/my-message-commands'
import { apiQuery, type ApiArrayContract } from '../../response-contract.mts'
import { preciseTimestampPaginationParser } from '@modules/pagination'
import type { ApiUuidContract } from '../../request-contract-types.mts'
const MAX_RECIPIENTS = 25
type CreateConversationRequest =
  | { user_id: ApiUuidContract }
  | { user_ids: ApiArrayContract<ApiUuidContract, 1, typeof MAX_RECIPIENTS, false> }

app.route('/api/v1/my/messages').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/messages', preciseTimestampPaginationParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages')
  const result = await listMyMessageConversations(currentUser, ctx.query, input =>
    validateRequestContract(ctx, 'GET:/api/v1/my/messages', input),
  )
  ctx.json(result)
})

app.route('/api/v1/my/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/messages')
  const result = await createMyMessageConversation(
    currentUser,
    async () => (await ctx.request.json('10kb')) as CreateConversationRequest,
    input => validateRequestContract(ctx, 'POST:/api/v1/my/messages', input),
  )
  ctx.setStatus(201)
  ctx.json(result)
})
