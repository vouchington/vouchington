import {
  createSubagentTool,
  sanitizeAndWrapUserInput,
  CHAT_SUBAGENT_RETRY_POLICY,
} from '@agents/_shared'
import getTrendingTopicsTool from '@voucha/tools/get-trending-topics'
import getTrendingPostsTool from '@voucha/tools/get-trending-posts'
import getRecommendedTopicsTool from '@voucha/tools/get-recommended-topics'
import searchTopicsTool from '@voucha/tools/search-topics'
import getTopicDetailsTool from '@voucha/tools/get-topic-details'
import { DISCOVERY_SYSTEM_PROMPT } from './build-system-prompt.mts'

interface DiscoveryAgentArgs {
  query: string
  context?: string
}

const discoveryAgentTool = createSubagentTool<DiscoveryAgentArgs>({
  name: 'run_discovery_agent',
  description:
    'Delegates a discovery task to a specialized agent that surfaces trending topics, trending posts, and personalized recommendations. Use when the user asks what is trending or popular, wants to know what is new this week, or wants personalized suggestions for what to look into. Returns a curated discovery summary.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The discovery question or request',
      },
      context: {
        type: 'string',
        description: 'Optional context from the conversation to help focus the discovery',
      },
    },
    required: ['query'],
  },
  agentName: 'discovery',
  systemPrompt: DISCOVERY_SYSTEM_PROMPT,
  maxIterations: 6,
  maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries,
  toolEntries: [
    getTrendingTopicsTool,
    getTrendingPostsTool,
    getRecommendedTopicsTool,
    searchTopicsTool,
    getTopicDetailsTool,
  ],
  serviceTier: 'flex',
  getInput: async (args: DiscoveryAgentArgs) => {
    const query = await sanitizeAndWrapUserInput(args.query, 'discovery_agent_query')
    if (!args.context) return query

    const context = await sanitizeAndWrapUserInput(args.context, 'discovery_agent_context')
    return `${query}\n\nConversation context:\n${context}`
  },
})

export { discoveryAgentTool }
