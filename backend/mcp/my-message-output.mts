import type {
  DirectConversation,
  DirectMessage,
  ConversationParticipant,
} from '@services/messaging/types'
import { externalText, sanitizedTitle, iso } from './mcp-read-output.mts'

export async function messageConversationOutput(conversation: DirectConversation) {
  return {
    ...conversation,
    title: await sanitizedTitle(conversation.title),
    created_at: iso(conversation.created_at),
    updated_at: iso(conversation.updated_at),
    ...(conversation.participant_usernames
      ? {
          participant_usernames: await Promise.all(
            conversation.participant_usernames.map(sanitizedTitle),
          ),
        }
      : {}),
  }
}

export async function directMessageOutput(message: DirectMessage) {
  return {
    ...message,
    body_text: (await externalText(message.body_text, 'direct_message', 'message_body')) ?? '',
    ...(message.sender_username
      ? { sender_username: await sanitizedTitle(message.sender_username) }
      : {}),
    created_at: iso(message.created_at),
    updated_at: iso(message.updated_at),
    deleted_at: message.deleted_at ? iso(message.deleted_at) : null,
  }
}

export async function messageParticipantOutput(participant: ConversationParticipant) {
  return {
    ...participant,
    username: participant.username === null ? null : await sanitizedTitle(participant.username),
    created_at: iso(participant.created_at),
    removed_at: participant.removed_at ? iso(participant.removed_at) : null,
  }
}
