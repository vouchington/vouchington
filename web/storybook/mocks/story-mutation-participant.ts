import { storybookUserSummary } from '@/storybook/design-system/autocomplete-fixtures'
import { storyMutationAt, storyText } from '@/storybook/mocks/story-mutation-bodies'

let nextParticipant = 0

export function resetParticipantSequence(): void {
  nextParticipant = 0
}

export function conversationParticipant(endpoint: string, body: unknown): unknown {
  const userId = storyText(body, 'user_id')
  const user = storybookUserSummary(userId)
  return {
    participant: {
      id: `participant-story-${(nextParticipant += 1)}`,
      conversation_id: endpoint.split('/')[5] ?? 'conversation-story',
      user_id: userId,
      role: 'member',
      created_at: storyMutationAt,
      username: user.username,
      profile_image_id: user.profile_image_id,
    },
  }
}
