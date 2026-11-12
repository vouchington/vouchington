import { trackAIEmbeddingCall } from '@services/analytics'
import { GEMINI_EMBEDDING_2_MODEL_NAME } from '../config.mts'
import { requireVertexEnvironment, vertexRequest } from '../vertex.mts'

type CreateEmbeddingOptions = {
  entityType: 'post' | 'topic' | 'rss_feed_item' | 'crawl_chunk' | 'search'
  intent?: 'query' | 'document'
  title?: string
  abortSignal?: AbortSignal
}

type EmbeddingResult = {
  embedding: unknown
  tokens: number | null
}

export const createEmbedding = async (
  text: string,
  options?: CreateEmbeddingOptions,
): Promise<EmbeddingResult> => {
  const start = Date.now()
  try {
    const result = await requestEmbedding(text, options)
    trackAIEmbeddingCall({
      service: 'vertex',
      model: GEMINI_EMBEDDING_2_MODEL_NAME,
      tokens: result.tokens ?? 0,
      durationMs: Date.now() - start,
      success: true,
      entityType: options?.entityType || 'unknown',
      invocation: 'single',
    })
    return result
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.name : 'UnknownError'
    trackAIEmbeddingCall({
      service: 'vertex',
      model: GEMINI_EMBEDDING_2_MODEL_NAME,
      tokens: 0,
      durationMs: Date.now() - start,
      success: false,
      errorType: errorMessage,
      entityType: options?.entityType || 'unknown',
      invocation: 'single',
    })
    throw err
  }
}

export function buildEmbeddingContent(
  text: string,
  intent: 'query' | 'document' = 'document',
  title?: string,
) {
  // The application's text sampling budget is independent of the provider's token limit.
  // Both paths use the same sample; cache and batch manifest identities retain the full content.
  const boundedText = sampleEmbeddingText(text)
  const content =
    intent === 'query'
      ? `task: search result | query: ${boundedText}`
      : `title: ${title || 'none'} | text: ${boundedText}`
  return { parts: [{ text: content }] }
}

function sampleEmbeddingText(text: string): string {
  if (text.length <= 8192) return text
  let head = text.slice(0, 8192)
  if (/\s/.test(text.charAt(8192))) return head
  head = head.replace(/[\uD800-\uDBFF]$/, '')
  const whitespace = head.search(/\s\S*$/)
  return whitespace > 0 ? head.slice(0, whitespace) : head
}

async function requestEmbedding(
  text: string,
  options?: CreateEmbeddingOptions,
): Promise<EmbeddingResult> {
  const project = requireVertexEnvironment('VERTEX_PROJECT_ID')
  const result = await vertexRequest(
    `projects/${encodeURIComponent(project)}/locations/us/publishers/google/models/${GEMINI_EMBEDDING_2_MODEL_NAME}:embedContent`,
    {
      content: buildEmbeddingContent(
        text,
        options?.intent ?? (options?.entityType === 'search' ? 'query' : 'document'),
        options?.title,
      ),
      embedContentConfig: { outputDimensionality: 1536 },
    },
    options?.abortSignal,
  )
  if (!result || typeof result !== 'object' || !('embedding' in result))
    throw new Error('Vertex embedding response did not include an embedding')
  const embedding = result.embedding
  if (!embedding || typeof embedding !== 'object' || !('values' in embedding))
    throw new Error('Vertex embedding response did not include values')
  const usage = 'usageMetadata' in result ? result.usageMetadata : null
  const tokenCount =
    usage && typeof usage === 'object' && 'promptTokenCount' in usage
      ? Number(usage.promptTokenCount)
      : null
  return {
    embedding: embedding.values,
    tokens:
      tokenCount !== null && Number.isSafeInteger(tokenCount) && tokenCount >= 0
        ? tokenCount
        : null,
  }
}
