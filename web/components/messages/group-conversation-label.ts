import type { DirectMessageParticipant } from '@/types/messages'

export function getGroupConversationLabel(others: DirectMessageParticipant[]): string {
  const displayed = others.slice(0, 3)
  const extraCount = others.length > 3 ? others.length - 3 : 0
  const labelParts = displayed.map(p => (p.username ? `@${p.username}` : 'Member'))
  if (labelParts.length === 0) return 'Conversation'
  return extraCount > 0 ? `${labelParts.join(', ')} +${extraCount} more` : labelParts.join(', ')
}
