import {
  createMyMessageConversation,
  sendMyConversationMessage,
  addMyConversationParticipant,
  removeMyConversationParticipant,
  updateMyConversationPolicy,
} from '@services/messaging/my-message-commands'
import {
  messageConversationOutput,
  directMessageOutput,
  messageParticipantOutput,
} from './my-message-output.mts'
import {
  source,
  type CreateArgs,
  type SendArgs,
  type ParticipantArgs,
  type PolicyArgs,
  ROOT,
  uuid,
  conversationProperties,
  path,
  validated,
  readMessageBody,
} from './my-message-tool.mts'

export const manageMyMessagesGroup = {
  name: 'manage_my_messages',
  options: [
    {
      option: 'create',
      source: source<CreateArgs>(
        'Start or find a direct conversation with user_id, or create a group with user_ids.',
        { method: 'POST', path: ROOT },
        {},
        [],
        async (user, args) => {
          const result = await createMyMessageConversation(
            user,
            () => readMessageBody(args),
            validated,
          )
          return { conversation: await messageConversationOutput(result.conversation) }
        },
        true,
        {
          type: 'object',
          oneOf: [
            {
              type: 'object',
              properties: { user_id: uuid },
              required: ['user_id'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: { user_ids: { type: 'array', items: uuid, minItems: 1, maxItems: 25 } },
              required: ['user_ids'],
              additionalProperties: false,
            },
          ],
        },
      ),
    },
    {
      option: 'update',
      source: source<PolicyArgs>(
        'Change a group’s participant-add policy as its owner.',
        { method: 'PATCH', path: `${ROOT}/:conversationId` },
        {
          ...conversationProperties,
          participant_add_policy: { type: 'string', enum: ['owner_only', 'all_members'] },
        },
        ['conversation_id', 'participant_add_policy'],
        (user, args) =>
          updateMyConversationPolicy(
            user,
            path(args),
            () => readMessageBody({ participant_add_policy: args.participant_add_policy }),
            validated,
          ),
        true,
      ),
    },
    {
      option: 'send',
      source: source<SendArgs>(
        'Send text to a direct-message conversation.',
        { method: 'POST', path: `${ROOT}/:conversationId/messages` },
        { ...conversationProperties, text: { type: 'string' } },
        ['conversation_id', 'text'],
        async (user, args) => {
          const result = await sendMyConversationMessage(
            user,
            path(args),
            () => readMessageBody({ text: args.text }),
            validated,
          )
          return { message: await directMessageOutput(result.message) }
        },
        true,
      ),
    },
    {
      option: 'add_participant',
      source: source<ParticipantArgs>(
        'Add a recipient to a group, subject to its participant policy and recipient rules.',
        { method: 'POST', path: `${ROOT}/:conversationId/participants` },
        { ...conversationProperties, user_id: uuid },
        ['conversation_id', 'user_id'],
        async (user, args) => {
          const result = await addMyConversationParticipant(
            user,
            path(args),
            () => readMessageBody({ user_id: args.user_id }),
            validated,
          )
          return { participant: await messageParticipantOutput(result.participant) }
        },
        true,
      ),
    },
    {
      option: 'remove_participant',
      source: source<ParticipantArgs>(
        'Leave a direct-message group or remove a participant when authorized.',
        { method: 'DELETE', path: `${ROOT}/:conversationId/participants/:userId` },
        { ...conversationProperties, user_id: uuid },
        ['conversation_id', 'user_id'],
        async (user, args) => {
          await removeMyConversationParticipant(
            user,
            { ...path(args), userId: args.user_id },
            validated,
          )
          return { success: true }
        },
        true,
      ),
    },
  ],
} as const
