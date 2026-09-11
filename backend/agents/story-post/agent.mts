import {
  createOpenAIResponse,
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils/responses'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import type { Story } from '@services/stories/types'

export interface StoryPostAgentResult {
  title: string
  ai_summary_markdown: string
}

interface CallStoryPostAgentDeps {
  createOpenAIResponse?: typeof createOpenAIResponse
}

const SYSTEM_INSTRUCTIONS = `You are a news editor. Given a news story and its source articles, generate a title and summary for the story post.

Rules:
- The title must be concise (max 100 characters), neutral, and factual
- Do not include publication names in the title
- The ai_summary_markdown should be a 2-3 sentence markdown summary of the news event
- Focus on facts, not speculation
- Be neutral in tone

Respond with valid JSON in this exact format:
{
  "title": "concise neutral headline",
  "ai_summary_markdown": "2-3 sentence markdown summary of the event"
}`

/* no-mistakes: integration=openai */
export async function callStoryPostAgent(
  story: Story,
  itemSummaries: Array<{ title: string; summary: string }>,
  deps: CallStoryPostAgentDeps = {},
): Promise<StoryPostAgentResult> {
  const createResponse = deps.createOpenAIResponse ?? createOpenAIResponse

  const [sanitizedArticles, sanitizedStoryTitle] = await Promise.all([
    Promise.all(
      itemSummaries.map(async (item, i) => {
        const sanitized = await sanitizePromptInjection(
          `Title: ${item.title}\nSummary: ${item.summary}`,
        )
        return `Article ${i + 1}:\n${wrapExternalContent(sanitized, { source: 'rss_feed', contentType: 'article' })}`
      }),
    ),
    sanitizePromptInjection(story.title ?? 'Untitled'),
  ])
  const articleList = sanitizedArticles.join('\n\n')
  const wrappedStoryTitle = wrapExternalContent(sanitizedStoryTitle, {
    source: 'rss_feed',
    contentType: 'story_title',
  })

  const content = `Story title: ${wrappedStoryTitle}\nPublished: ${story.published_at?.toISOString() ?? 'Unknown'}\n\nSource articles:\n${articleList}`

  // Records the ledger row for both outcomes: a successful response, or a failed/incomplete one
  // (which still billed tokens) before the error propagates, so a queued retry doesn't compound
  // an unrecorded charge with another one.
  const response = await callRecordingAgentResponseUsage(
    () =>
      createResponse(
        {
          model: DEFAULT_AGENT_MODEL,
          instructions: SYSTEM_INSTRUCTIONS,
          input: content,
          safety_identifier: story.id,
          metadata: {
            type: 'story_post_generation',
          },
          // Background generation, not user-facing latency-sensitive: half-price flex tier.
          service_tier: 'flex',
          // SYSTEM_INSTRUCTIONS is a static prefix shared by every story-post call. Versioned so a
          // prompt edit can be paired with a key bump to invalidate.
          prompt_cache_key: 'story-post-v1',
        },
        { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
      ),
    { agentSlug: 'story-post' },
  )

  const text = extractTextFromOpenAIResponse(response)

  interface ParsedResponse {
    title?: string
    ai_summary_markdown?: string
  }

  const parsed = parseLLMJsonResponse<ParsedResponse>(text)
  if (
    typeof parsed.ai_summary_markdown !== 'string' ||
    parsed.ai_summary_markdown.trim().length === 0
  ) {
    throw new TypeError(`Invalid story post agent result: ${JSON.stringify(parsed)}`)
  }

  return {
    title: (
      (typeof parsed.title === 'string' ? parsed.title.trim() : '') ||
      story.title?.trim() ||
      'Story'
    ).slice(0, 100),
    ai_summary_markdown: parsed.ai_summary_markdown,
  }
}
