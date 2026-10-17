import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import {
  buildPageInfo,
  decodeUuidCursor,
  encodeCursor,
  isSimpleCursor,
  isPreciseTimestampCursor,
  simplePaginationParser,
  preciseTimestampPaginationParser,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { getPaginationLimitsForContract } from '@services/pagination'
import {
  getConversationMessages,
  getConversationParticipants,
  getMyDirectConversations,
  getConversationForThread,
} from './get.mts'
import { currentUserCanViewConversation } from './authorization.mts'
import type { MessageRequestValidation, MessageQuery } from './my-message-request.mts'

export async function listMyMessageConversations(
  currentUser: PrivateUser,
  queryInput: MessageQuery,
  validate: MessageRequestValidation,
) {
  const { after: encodedAfter, limit } = preciseTimestampPaginationParser.parse(
    queryInput,
    getPaginationLimitsForContract(preciseTimestampPaginationParser.queryContract),
  )
  const query = prepareQueryForValidation(
    queryInput,
    preciseTimestampPaginationParser.queryContract,
  )
  if (queryInput.limit !== undefined) query.limit = limit
  validate({ query })
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isPreciseTimestampCursor, 'Invalid conversation cursor')
    : undefined

  const conversations = await getMyDirectConversations(currentUser.id, { after, limit })
  const hasMore = conversations.length > limit
  const cursorRows = conversations.slice(0, limit)
  const results = cursorRows.map(({ cursor_timestamp: _, ...conversation }) => conversation)
  return {
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage: hasMore,
      getCursor: conversation => ({
        timestamp: conversation.cursor_timestamp,
        id: conversation.id,
      }),
    }),
  }
}

export async function listMyConversationMessages(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  queryInput: MessageQuery,
  validate: MessageRequestValidation,
) {
  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  assert(canView, 403, 'Access denied')

  const { after: encodedAfter, limit } = simplePaginationParser.parse(
    queryInput,
    getPaginationLimitsForContract(simplePaginationParser.queryContract),
  )
  const query = prepareQueryForValidation(queryInput, simplePaginationParser.queryContract)
  if (queryInput.limit !== undefined) query.limit = limit
  validate({
    path,
    query,
  })
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid message cursor')
    : undefined

  const messages = await getConversationMessages(conversationId, {
    after,
    limit,
  })
  const hasMore = messages.length > limit
  const results = hasMore ? messages.slice(1) : messages
  return {
    results,
    page_info: {
      has_next_page: hasMore,
      start_cursor: results.at(-1) ? encodeCursor({ id: results.at(-1)!.id }) : null,
      end_cursor: hasMore && results[0] ? encodeCursor({ id: results[0].id }) : null,
    },
  }
}

export async function listMyConversationParticipants(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  queryInput: MessageQuery,
  validate: MessageRequestValidation,
) {
  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  assert(canView, 403, 'Access denied')

  const { after: encodedAfter, limit } = simplePaginationParser.parse(
    queryInput,
    getPaginationLimitsForContract(simplePaginationParser.queryContract),
  )
  const query = prepareQueryForValidation(queryInput, simplePaginationParser.queryContract)
  if (queryInput.limit !== undefined) query.limit = limit
  validate({
    path,
    query,
  })
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid participant cursor')
    : undefined
  const participants = await getConversationParticipants(conversationId, { after, limit })
  const hasMore = participants.length > limit
  const results = participants.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: hasMore,
      getCursor: participant => ({ id: participant.id }),
    }),
  }
}

export async function getMyMessageConversation(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  validate: MessageRequestValidation,
) {
  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  validate({ path })

  const conversation = await getConversationForThread(currentUser.id, conversationId)
  assert(conversation, 403, 'Access denied')

  return { conversation }
}
