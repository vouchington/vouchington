import {
  listMyMessageConversations,
  getMyMessageConversation,
  listMyConversationMessages,
  listMyConversationParticipants,
} from '@services/messaging/my-message-commands'
import {
  messageConversationOutput,
  directMessageOutput,
  messageParticipantOutput,
} from './my-message-output.mts'
import {
  source,
  type PageArgs,
  type ConversationArgs,
  ROOT,
  pageProperties,
  conversationProperties,
  page,
  path,
  validated,
} from './my-message-tool.mts'

export const readMyMessagesGroup = {
  name: 'read_my_messages',
  options: [
    {
      option: 'list',
      source: source<PageArgs>(
        'List your direct-message conversations, newest activity first.',
        { method: 'GET', path: ROOT },
        pageProperties,
        [],
        async (user, args) => {
          const result = await listMyMessageConversations(user, page(args), validated)
          return {
            ...result,
            results: await Promise.all(result.results.map(messageConversationOutput)),
          }
        },
      ),
    },
    {
      option: 'get',
      source: source<ConversationArgs>(
        'Read a direct-message conversation you participate in.',
        { method: 'GET', path: `${ROOT}/:conversationId` },
        conversationProperties,
        ['conversation_id'],
        async (user, args) => {
          const result = await getMyMessageConversation(user, path(args), validated)
          return { conversation: await messageConversationOutput(result.conversation) }
        },
      ),
    },
    {
      option: 'messages',
      source: source<ConversationArgs>(
        'Read a conversation’s messages; without a cursor returns the most recent page in chronological order.',
        { method: 'GET', path: `${ROOT}/:conversationId/messages` },
        { ...conversationProperties, ...pageProperties },
        ['conversation_id'],
        async (user, args) => {
          const result = await listMyConversationMessages(user, path(args), page(args), validated)
          return { ...result, results: await Promise.all(result.results.map(directMessageOutput)) }
        },
      ),
    },
    {
      option: 'participants',
      source: source<ConversationArgs>(
        'Read active participants in a direct-message conversation.',
        { method: 'GET', path: `${ROOT}/:conversationId/participants` },
        { ...conversationProperties, ...pageProperties },
        ['conversation_id'],
        async (user, args) => {
          const result = await listMyConversationParticipants(
            user,
            path(args),
            page(args),
            validated,
          )
          return {
            ...result,
            results: await Promise.all(result.results.map(messageParticipantOutput)),
          }
        },
      ),
    },
  ],
} as const
