import { exclusions, type WriteExclusion } from './mcp-write-exclusions-builder.mts'

// Community owner and AI-agent administration stays off every MCP tool. The moderator tools in
// backend/mcp/community-moderation-routes.test.mts must never reach these operations.
export function isCommunityOwnerAiOperation(method: string, path: string): boolean {
  const match = path.match(/^\/api\/v1\/communities\/[^/]+(?<tail>\/.*)?$/)
  if (!match) return false
  const tail = match.groups?.tail ?? ''
  return (
    (method === 'DELETE' && tail === '') ||
    (method === 'POST' && tail === '/ownership-transfers') ||
    (method === 'PATCH' && /^\/members\/[^/]+$/.test(tail)) ||
    tail === '/agent-prompts' ||
    tail.startsWith('/agent-prompts/') ||
    tail === '/ai-agents' ||
    tail.startsWith('/ai-agents/') ||
    (method === 'PATCH' && tail === '/automod-settings') ||
    (method === 'POST' && tail === '/automod/simulate') ||
    (method === 'POST' && /^\/automod\/recent-actions\/[^/]+\/feedback$/.test(tail))
  )
}

// Derived from the REST operation keys (`METHOD:/path`) so the table cannot drift from the predicate.
export function communityOwnerAiExclusions(operationKeys: readonly string[]): WriteExclusion[] {
  const matching = operationKeys.filter(key => {
    const separator = key.indexOf(':')
    return isCommunityOwnerAiOperation(key.slice(0, separator), key.slice(separator + 1))
  })
  return exclusions(
    'community-owner-ai',
    'Community owner and AI-agent administration; excluded from every moderator tool',
    matching.map(key => key.replace(':', ' ')),
    '',
  )
}
