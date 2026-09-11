export const AGENT_DIRECTORY_CURSOR_SCOPE = 'agent-directory:id-desc'

export type UnresolvedTextFilter = {
  kind: 'username' | 'post_slug'
  value: string
}

export function agentConversationListCursorScope(options: {
  agentSystemUserId: string
  userId?: string
  postId?: string
  rssFeedItemId?: string
  onlyLinked: boolean
  unresolvedTextFilters?: readonly UnresolvedTextFilter[]
}): string {
  return JSON.stringify({
    agentSystemUserId: options.agentSystemUserId,
    userId: options.userId ?? null,
    postId: options.postId ?? null,
    rssFeedItemId: options.rssFeedItemId ?? null,
    onlyLinked: options.onlyLinked,
    order: 'id-desc',
    ...(options.unresolvedTextFilters?.length
      ? { unresolvedTextFilters: options.unresolvedTextFilters }
      : {}),
  })
}

export function agentMessageCursorScope(agentId: string, conversationId: string): string {
  return JSON.stringify({ agentId, conversationId, order: 'id-desc' })
}
