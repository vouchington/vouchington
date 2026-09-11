import type { ManifestEndpoint } from './endpoint-registry'

const directoryAfter =
  'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDMwMSIsInNjb3BlIjoiYWdlbnQtZGlyZWN0b3J5OmlkLWRlc2MifQ'
const conversationsAfter =
  'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMTAxMSIsInNjb3BlIjoie1wiYWdlbnRTeXN0ZW1Vc2VySWRcIjpcIjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMVwiLFwidXNlcklkXCI6bnVsbCxcInBvc3RJZFwiOm51bGwsXCJyc3NGZWVkSXRlbUlkXCI6bnVsbCxcIm9ubHlMaW5rZWRcIjp0cnVlLFwib3JkZXJcIjpcImlkLWRlc2NcIn0ifQ'
const messagesAfter =
  'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSIsInNjb3BlIjoie1wiYWdlbnRJZFwiOlwiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMzAyXCIsXCJjb252ZXJzYXRpb25JZFwiOlwiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMTAxXCIsXCJvcmRlclwiOlwiaWQtZGVzY1wifSJ9'
const conversationPath = '/api/v1/agents/helper/conversations/00000000-0000-7000-8000-000000000101'

export const agentEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.agents.default': endpoint('/api/v1/agents'),
  'native.agents.page-2': endpoint('/api/v1/agents', directoryAfter),
  'native.agents.detail.default': { method: 'GET', path: '/api/v1/agents/helper' },
  'native.agents.conversations.default': endpoint('/api/v1/agents/helper/conversations'),
  'native.agents.conversations.filtered-username': {
    method: 'GET',
    path: '/api/v1/agents/helper/conversations',
    query: { limit: '2', username: 'fixture-agent-user-011' },
  },
  'native.agents.conversations.page-2': endpoint(
    '/api/v1/agents/helper/conversations',
    conversationsAfter,
  ),
  'native.agents.conversation.default': endpoint(conversationPath),
  'native.agents.conversation.page-2': endpoint(conversationPath, messagesAfter),
}

function endpoint(path: string, after?: string): ManifestEndpoint {
  return { method: 'GET', path, query: { ...(after ? { after } : {}), limit: '2' } }
}
