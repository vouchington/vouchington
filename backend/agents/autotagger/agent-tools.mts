import { sanitizeClassifierExternalContent } from '@agents/classifiers/safe-content'
import type { ToolDefinition } from '@modules/model-providers/tool-turn-types'
import { getTopicIds } from '@services/topics/search/get-ids'

export const SEARCH_TOPICS_TOOL = 'search_topics'
export const SUBMIT_TOPICS_TOOL = 'submit_topics'

/** The most topics one search returns; a lookup only needs the closest few names. */
const SEARCH_RESULT_LIMIT = 5
const MAX_QUERY_LENGTH = 200

export type TopicSearchHit = { id: string; name: string; slug: string }
export type SearchTopics = (query: string) => Promise<readonly TopicSearchHit[]>

/** The text search over topic names and slugs the agent may use to check what a topic means. */
export const searchTopicsByText: SearchTopics = async query => {
  const { results } = await getTopicIds({ text_search_query: query, limit: SEARCH_RESULT_LIMIT })
  return results.map(topic => ({ id: topic.id, name: topic.name, slug: topic.slug }))
}

export function buildAutotaggerAgentTools(candidateIds: readonly string[]): ToolDefinition[] {
  return [
    {
      name: SEARCH_TOPICS_TOOL,
      description:
        'Search topics by name or slug. Returns up to 5 matching topics with their ids and whether each is one of the candidates you may submit.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            maxLength: MAX_QUERY_LENGTH,
            description: 'Text to search for.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: SUBMIT_TOPICS_TOOL,
      description:
        'Submit your final answer: the ids of the candidate topics that are true of the content. An empty list means none are. Call this exactly once.',
      inputSchema: {
        type: 'object',
        properties: {
          topic_ids: {
            type: 'array',
            items: { type: 'string', enum: [...candidateIds] },
            uniqueItems: true,
            maxItems: candidateIds.length,
          },
        },
        required: ['topic_ids'],
        additionalProperties: false,
      },
    },
  ]
}

/** The answer if `input` is a valid submission against the candidate set, else why it is not. */
export function parseSubmission(
  input: unknown,
  candidateIds: ReadonlySet<string>,
): { ok: true; topicIds: string[] } | { ok: false; error: string } {
  const ids = (input as { topic_ids?: unknown } | null)?.topic_ids
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string'))
    return { ok: false, error: 'topic_ids must be an array of candidate topic id strings.' }
  const unknown = ids.filter(id => !candidateIds.has(id))
  if (unknown.length > 0)
    return { ok: false, error: 'topic_ids may only contain ids from the candidate list.' }
  return { ok: true, topicIds: [...new Set<string>(ids)] }
}

/** Runs a search call and renders its result as the tool's JSON text; names are sanitized. */
export async function runSearchTopicsTool(
  input: unknown,
  candidateIds: ReadonlySet<string>,
  search: SearchTopics,
): Promise<{ content: string; isError: boolean }> {
  const query = (input as { query?: unknown } | null)?.query
  if (typeof query !== 'string' || query.trim() === '' || query.length > MAX_QUERY_LENGTH)
    return { content: 'query must be a non-empty string.', isError: true }
  const hits = await search(query.trim())
  const topics = await Promise.all(
    hits.map(async hit => ({
      id: hit.id,
      name: await sanitizeClassifierExternalContent(hit.name, {
        source: 'topics',
        contentType: 'topic_search_result',
        isTitle: true,
        includeReminder: false,
      }),
      candidate: candidateIds.has(hit.id),
    })),
  )
  return { content: JSON.stringify({ topics }), isError: false }
}
