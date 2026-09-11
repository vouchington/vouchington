import {
  createSubagentTool,
  sanitizeAndWrapUserInput,
  CHAT_SUBAGENT_RETRY_POLICY,
} from '@agents/_shared'
import searchPostsTool from '@voucha/tools/search-posts'
import searchCrawlsTool from '@voucha/tools/search-crawls'
import searchRssFeedItemsTool from '@voucha/tools/search-rss-feed-items'
import searchCrawlsSemanticTool from '@voucha/tools/search-crawls-semantic'
import searchDataPointsTool from '@voucha/tools/search-data-points'
import getTopicInsightsTool from '@voucha/tools/get-topic-insights'
import compareTopicsTool from '@voucha/tools/compare-topics'
import getReferralLinksTool from '@voucha/tools/get-referral-links'
import searchTopicsTool from '@voucha/tools/search-topics'
import getWikipediaSummaryTool from '@voucha/tools/get-wikipedia-summary'
import getTopicDetailsTool from '@voucha/tools/get-topic-details'
import getTopicHierarchyTool from '@voucha/tools/get-topic-hierarchy'
import getTopicMetricsTool from '@voucha/tools/get-topic-metrics'
import { RESEARCH_SYSTEM_PROMPT } from './build-system-prompt.mts'

interface ResearchAgentArgs {
  query: string
  context?: string
}

const researchAgentTool = createSubagentTool<ResearchAgentArgs>({
  name: 'run_research_agent',
  description:
    'Delegates a research task to a specialized agent that searches posts, web content, data points, and topic insights to produce a comprehensive summary. Use for broad questions requiring multiple searches or deep analysis (e.g. "find the best card for me", "compare travel cards"). Returns a synthesized research summary.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The research question or task to investigate',
      },
      context: {
        type: 'string',
        description: 'Optional context from the conversation to help focus the research',
      },
    },
    required: ['query'],
  },
  agentName: 'research',
  systemPrompt: RESEARCH_SYSTEM_PROMPT,
  maxIterations: 10,
  maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries,
  toolEntries: [
    searchPostsTool,
    searchCrawlsTool,
    searchRssFeedItemsTool,
    searchCrawlsSemanticTool,
    searchDataPointsTool,
    getTopicInsightsTool,
    compareTopicsTool,
    getReferralLinksTool,
    searchTopicsTool,
    getWikipediaSummaryTool,
    getTopicDetailsTool,
    getTopicHierarchyTool,
    getTopicMetricsTool,
  ],
  serviceTier: 'flex',
  getInput: async (args: ResearchAgentArgs) => {
    const query = await sanitizeAndWrapUserInput(args.query, 'research_agent_query')
    if (!args.context) return query

    const context = await sanitizeAndWrapUserInput(args.context, 'research_agent_context')
    return `${query}\n\nConversation context:\n${context}`
  },
})

export { researchAgentTool }
