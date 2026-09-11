import {
  buildAgentTools,
  DEFAULT_AGENT_MODEL,
  runToolLoopStreaming,
  sanitizeAndWrapUserInput,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import type { BasicUser } from '@services/users/types'
import { publishAgentResponseEvent } from '@services/agent-responses/events'
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
import onError from '@modules/on-error'
import { createMarkdownStreamBuffer } from '@jongleberry/vurst-markdown/streaming-buffer'

export interface ResearchResponseResult {
  content: string | null
  terminationReason: string
}

const RESEARCH_TOOL_ENTRIES = [
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
]

export async function streamResearchResponse(params: {
  currentUser: BasicUser
  task: string
  context?: string
  agentResponseId: string
  signal?: AbortSignal
}): Promise<ResearchResponseResult> {
  const { currentUser, task, context, agentResponseId, signal } = params

  const sanitizedTask = await sanitizeAndWrapUserInput(task, 'research_agent_task')
  const input = context
    ? `${sanitizedTask}\n\nConversation context:\n${await sanitizeAndWrapUserInput(context, 'research_agent_context')}`
    : sanitizedTask

  const { agentTools } = buildAgentTools(currentUser, RESEARCH_TOOL_ENTRIES)

  let fullContent = ''
  const markdownBuffer = createMarkdownStreamBuffer()

  const gen = runToolLoopStreaming({
    model: DEFAULT_AGENT_MODEL,
    instructions: RESEARCH_SYSTEM_PROMPT,
    tools: agentTools,
    input,
    maxIterations: 10,
    safetyIdentifier: currentUser.id,
    agentSlug: 'research-agent',
    signal,
    maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
    // RESEARCH_SYSTEM_PROMPT is a static instructions string shared by every research turn —
    // a stable prefix worth caching. Versioned so a prompt edit can be paired with a key bump.
    extraParams: { service_tier: 'flex', prompt_cache_key: 'research-agent-v1' },
  })

  let step = await gen.next()
  while (!step.done) {
    const ev = step.value
    if (ev.type === 'text') {
      fullContent += ev.content
      for (const piece of markdownBuffer.push(ev.content)) {
        publishAgentResponseEvent(agentResponseId, {
          type: 'progress',
          content: piece,
        }).catch(onError)
      }
    } else if (ev.type === 'tool_call') {
      const iterTail = markdownBuffer.flush()
      if (iterTail) {
        publishAgentResponseEvent(agentResponseId, {
          type: 'progress',
          content: iterTail,
        }).catch(onError)
      }
      publishAgentResponseEvent(agentResponseId, {
        type: 'progress',
        tool_name: ev.name,
      }).catch(onError)
    }
    step = await gen.next()
  }

  const tail = markdownBuffer.flush()
  if (tail) {
    publishAgentResponseEvent(agentResponseId, {
      type: 'progress',
      content: tail,
    }).catch(onError)
  }

  const result = step.value

  if (!fullContent && result.text) {
    fullContent = result.text
  }

  if (!fullContent) {
    fullContent =
      result.terminationReason === 'max_iterations'
        ? 'I was unable to complete your research after several attempts. Please try rephrasing your question.'
        : 'Sorry, I could not generate a research summary. Please try again.'
  }

  return {
    content: fullContent,
    terminationReason: result.terminationReason,
  }
}
