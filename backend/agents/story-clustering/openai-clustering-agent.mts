import {
  createOpenAIResponse,
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils/responses'

export interface ClusteringAgentResult {
  should_cluster: boolean
  reason: string
  cluster_item_ids: string[]
  title?: string
  official_rss_feed_item_id?: string | null
  published_at?: string
}

interface CallOpenAIClusteringAgentDeps {
  createOpenAIResponse?: typeof createOpenAIResponse
}

const SYSTEM_INSTRUCTIONS = `You are a news editor. Given a new article and a list of candidate similar articles, decide whether the new article belongs to the same news story as any of the candidates.

Rules:
- Only group articles about the SAME specific event (not just the same topic)
- Rumors, leaks, and speculation are NOT the same story as official announcements
- Product reviews are NOT the same story as product launches
- Follow-up developments (e.g., "aftermath", "reactions") CAN be the same story if they reference the same event
- If candidates belong to different stories, pick the best match (or none)
- Different security incidents affecting different software are NOT the same story, even if they occur around the same time and share the same topic domain (e.g., a supply chain attack on library A and a data leak from tool B are separate stories)
- Articles about different products, companies, or projects are separate stories unless one directly references the other as the same event

If you decide to cluster:
1. Provide a concise neutral headline (max 100 chars)
2. Pick the official/primary source article
3. Determine when the event occurred (published_at) — use the earliest credible report's date

Respond with valid JSON in this exact format:
{
  "should_cluster": true,
  "reason": "brief explanation",
  "cluster_item_ids": ["id1", "id2"],
  "title": "headline",
  "official_rss_feed_item_id": "id or null",
  "published_at": "ISO 8601 date"
}

If you decide NOT to cluster, respond with:
{
  "should_cluster": false,
  "reason": "brief explanation",
  "cluster_item_ids": []
}

Rules for the response:
- Use the Article IDs provided in the input exactly as-is
- The title must be at most 100 characters
- Be neutral and factual
- published_at must be an ISO 8601 date string`

export async function callOpenAIClusteringAgent(
  content: string,
  safetyIdentifier: string,
  deps: CallOpenAIClusteringAgentDeps = {},
): Promise<ClusteringAgentResult> {
  const createResponse = deps.createOpenAIResponse ?? createOpenAIResponse

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
          safety_identifier: safetyIdentifier,
          metadata: {
            type: 'story_clustering',
          },
          // Background classification, not user-facing latency-sensitive: half-price flex tier.
          service_tier: 'flex',
          // SYSTEM_INSTRUCTIONS is a static prefix shared by every clustering call. Versioned so a
          // prompt edit can be paired with a key bump to invalidate.
          prompt_cache_key: 'story-clustering-v1',
        },
        { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
      ),
    { agentSlug: 'story-clustering' },
  )

  const text = extractTextFromOpenAIResponse(response)

  interface ParsedResponse {
    should_cluster?: boolean
    reason?: string
    cluster_item_ids?: string[]
    title?: string
    official_rss_feed_item_id?: string | null
    published_at?: string
  }

  const parsed = parseLLMJsonResponse<ParsedResponse>(text)

  if (typeof parsed.should_cluster !== 'boolean') {
    /* c8 ignore next -- guard for invalid LLM response; requires injecting a malformed OpenAI response */
    throw new TypeError(`Invalid should_cluster in OpenAI response: ${JSON.stringify(parsed)}`)
  }

  return {
    should_cluster: parsed.should_cluster,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    cluster_item_ids: Array.isArray(parsed.cluster_item_ids) ? parsed.cluster_item_ids : [],
    title:
      parsed.should_cluster && typeof parsed.title === 'string'
        ? parsed.title.slice(0, 100)
        : undefined,
    official_rss_feed_item_id:
      typeof parsed.official_rss_feed_item_id === 'string'
        ? parsed.official_rss_feed_item_id
        : null,
    published_at: typeof parsed.published_at === 'string' ? parsed.published_at : undefined,
  }
}
