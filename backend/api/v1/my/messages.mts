import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  findOrCreateDirectConversation,
  createGroupConversation,
  getMyDirectConversations,
  currentUserCanMessageUser,
} from '@services/messaging'
import { anyPairAmongUsersBlockedOrMuted } from '@services/entity-relations/check-block-mute'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { apiQuery, type ApiArrayContract } from '../../response-contract.mts'
import {
  buildPageInfo,
  decodeUuidCursor,
  isPreciseTimestampCursor,
  preciseTimestampPaginationParser,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const MAX_RECIPIENTS = 25

type CreateConversationRequest =
  | { user_id: ApiUuidContract }
  | { user_ids: ApiArrayContract<ApiUuidContract, 1, typeof MAX_RECIPIENTS, false> }

// GET /api/v1/my/messages
app.route('/api/v1/my/messages').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/messages', preciseTimestampPaginationParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages')

  const { after: encodedAfter, limit } = preciseTimestampPaginationParser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, preciseTimestampPaginationParser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = limit
  validateRequestContract(ctx, 'GET:/api/v1/my/messages', { query })
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isPreciseTimestampCursor, 'Invalid conversation cursor')
    : undefined

  const conversations = await getMyDirectConversations(currentUser.id, { after, limit })
  const hasMore = conversations.length > limit
  const cursorRows = conversations.slice(0, limit)
  const results = cursorRows.map(({ cursor_timestamp: _, ...conversation }) => conversation)
  ctx.json({
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage: hasMore,
      getCursor: conversation => ({
        timestamp: conversation.cursor_timestamp,
        id: conversation.id,
      }),
    }),
  })
})

// POST /api/v1/my/messages
app.route('/api/v1/my/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/messages')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as CreateConversationRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/messages', { body })

  const rawUserIds = 'user_id' in body ? [body.user_id] : body.user_ids
  // Normalize to lowercase so case variants of the same UUID compare equal, then deduplicate.
  const userIds = Array.from(new Set(rawUserIds.map(id => id.toLowerCase())))
  ctx.assert(!userIds.includes(currentUser.id), 400, 'Cannot message yourself')

  const recipients = await Promise.all(userIds.map(id => getPrivateUserByAny(id)))
  const canMessageChecks = await Promise.all(
    recipients.map((recipient, i) => {
      ctx.assert(recipient, 404, 'Recipient not found')
      return currentUserCanMessageUser(currentUser.id, userIds[i]!, recipient)
    }),
  )
  for (const canMessage of canMessageChecks) {
    ctx.assert(canMessage, 403, 'You cannot send messages to this user')
  }

  if (userIds.length > 1) {
    const pairBlocked = await anyPairAmongUsersBlockedOrMuted(userIds)
    ctx.assert(!pairBlocked, 403, 'Cannot create a group containing blocked users')
  }

  const conversation =
    userIds.length === 1
      ? await findOrCreateDirectConversation(currentUser.id, userIds[0]!)
      : await createGroupConversation(currentUser.id, userIds)

  ctx.setStatus(201)
  ctx.json({ conversation })
})
