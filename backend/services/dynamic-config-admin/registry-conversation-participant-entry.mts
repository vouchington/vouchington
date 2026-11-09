import {
  conversationParticipantLimitsConfig,
  CONVERSATION_PARTICIPANT_HARD_MAX,
} from '@services/messaging/participant-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const conversationParticipantLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'conversation-participant-limits',
  label: 'Conversation Participant Limits',
  description: 'How many participant rows one conversation may hold, including removed rows.',
  config: conversationParticipantLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    participants_per_conversation: {
      description: 'Maximum participant rows per conversation, including people who were removed.',
      minValue: 1,
      maxValue: CONVERSATION_PARTICIPANT_HARD_MAX,
      integer: true,
    },
  },
})
