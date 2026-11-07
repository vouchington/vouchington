import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/** Ever-bound row count for one conversation, including removed participants. */
export const CONVERSATION_PARTICIPANT_HARD_MAX = 50

const DEFAULT_PARTICIPANTS_PER_CONVERSATION = 25

export const conversationParticipantLimitsConfig = new DynamicConfig({
  key: 'conversation-participant-limits',
  fieldTypes: { participants_per_conversation: 'number' },
  defaultFields: { participants_per_conversation: DEFAULT_PARTICIPANTS_PER_CONVERSATION },
})

export function getConversationParticipantLimit(): number {
  return getBoundedPositiveIntegerField(
    conversationParticipantLimitsConfig,
    'participants_per_conversation',
    {
      defaultValue: DEFAULT_PARTICIPANTS_PER_CONVERSATION,
      maxValue: CONVERSATION_PARTICIPANT_HARD_MAX,
    },
  )
}
