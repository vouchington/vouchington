import {
  callAgentModel,
  QUEUED_BACKGROUND_RETRY_POLICY,
  type AgentModelCaller,
} from '@agents/_shared'
import { generateJson } from '@modules/model-providers/generate'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import type { Story } from '@services/stories/types'

export interface StoryPostAgentResult {
  title: string
  ai_summary_markdown: string
}

type StoryPostOutput = { title: string; ai_summary_markdown: string }

/** The model-calling seam. Injectable so tests can exercise the agent without a provider. */
export type StoryPostModelCaller = AgentModelCaller<StoryPostOutput>

const STORY_POST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ai_summary_markdown: { type: 'string' },
  },
  required: ['title', 'ai_summary_markdown'],
  additionalProperties: false,
} as const

const SYSTEM_INSTRUCTIONS = `You are a news editor. Given a news story and its source articles, generate a title and summary for the story post.

Rules:
- The title must be concise (max 100 characters), neutral, and factual
- Do not include publication names in the title
- The ai_summary_markdown should be a 2-3 sentence markdown summary of the news event
- Focus on facts, not speculation
- Be neutral in tone`

/* v8 ignore start -- thin provider integration wrapper; exercised by credentialed *.anthropic.test.mts */
export const callStoryPostModel: StoryPostModelCaller = (
  input,
  safetyIdentifier,
  { selection, openaiTransport },
) =>
  generateJson(
    selection,
    {
      instructions: SYSTEM_INSTRUCTIONS,
      input,
      schemaName: 'story_post_generation',
      schema: STORY_POST_SCHEMA,
      parse: parseStoryPostOutput,
      maxOutputTokens: 800,
      safetyIdentifier,
      // SYSTEM_INSTRUCTIONS is a static prefix shared by every story-post call. Versioned so a
      // prompt edit can be paired with a key bump to invalidate.
      promptCacheKey: 'story-post-v1',
      // Background generation, not user-facing latency-sensitive: half-price flex tier.
      flex: true,
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
    },
    { openaiTransport },
  )
/* v8 ignore stop */

export function parseStoryPostOutput(value: unknown): StoryPostOutput {
  const parsed = value as StoryPostOutput
  if (parsed.ai_summary_markdown.trim().length === 0) {
    throw new TypeError(`Invalid story post agent result: ${JSON.stringify(parsed)}`)
  }
  return parsed
}

export async function callStoryPostAgent(
  story: Story,
  itemSummaries: Array<{ title: string; summary: string }>,
  selection: ModelSelection,
  callModel: StoryPostModelCaller = callStoryPostModel,
): Promise<StoryPostAgentResult> {
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

  // Records the ledger row for both outcomes: a successful answer, or a billed one that failed
  // validation (which still billed tokens) before the error propagates, so a queued retry doesn't
  // compound an unrecorded charge with another one.
  const { output } = await callAgentModel({
    agentSlug: 'story-post',
    selection,
    input: content,
    safetyIdentifier: story.id,
    callModel,
  })

  return {
    title: (output.title.trim() || story.title?.trim() || 'Story').slice(0, 100),
    ai_summary_markdown: output.ai_summary_markdown,
  }
}
