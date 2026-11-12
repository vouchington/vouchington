import { trackAIEmbeddingCall } from '@services/analytics'
import { estimateTokens } from '@modules/utils'
import { GEMINI_EMBEDDING_2_MODEL_NAME } from '../config.mts'
import { requireVertexEnvironment, vertexRequest } from '../vertex.mts'

const MAX_EMBEDDING_INPUT_TOKENS = 8_192
const EMBEDDING_TOKEN_SAFETY_MARGIN = 512
const MAX_ESTIMATED_EMBEDDING_TOKENS = MAX_EMBEDDING_INPUT_TOKENS - EMBEDDING_TOKEN_SAFETY_MARGIN

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
  const prefix =
    intent === 'query' ? 'task: search result | query: ' : `title: ${title || 'none'} | text: `
  const boundedPrefix =
    intent === 'document' && estimateTokens(prefix) > MAX_ESTIMATED_EMBEDDING_TOKENS
      ? `title: ${truncateWithAffixes(
          title || 'none',
          'title: ',
          ' | text: ',
          MAX_ESTIMATED_EMBEDDING_TOKENS,
        )} | text: `
      : prefix
  // Count the complete inline protocol prefix and title with the body. Keep a margin because the
  // repository-owned four-character estimator is approximate, and the provider silently truncates.
  const boundedText = truncateWithAffixes(text, boundedPrefix, '', MAX_ESTIMATED_EMBEDDING_TOKENS)
  const content = `${boundedPrefix}${boundedText}`
  return { parts: [{ text: content }] }
}

function truncateWithAffixes(
  text: string,
  prefix: string,
  suffix: string,
  maxTokens: number,
): string {
  if (estimateTokens(`${prefix}${text}${suffix}`) <= maxTokens) return text

  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const end = safeCodePointEnd(text, middle)
    if (estimateTokens(`${prefix}${text.slice(0, end)}${suffix}`) <= maxTokens) low = middle
    else high = middle - 1
  }

  let end = safeCodePointEnd(text, low)
  let sample = text.slice(0, end)
  const lastPartialWord = sample.search(/\s\S*$/u)
  if (lastPartialWord > 0) sample = sample.slice(0, lastPartialWord)
  while (sample && estimateTokens(`${prefix}${sample}${suffix}`) > maxTokens) {
    sample = sample.slice(0, safeCodePointEnd(sample, sample.length - 1))
  }
  return sample
}

function safeCodePointEnd(text: string, end: number): number {
  if (end <= 0 || end >= text.length) return Math.max(0, Math.min(end, text.length))
  const previous = text.charCodeAt(end - 1)
  const next = text.charCodeAt(end)
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? end - 1
    : end
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
  if ('truncated' in result && result.truncated === true)
    throw new Error('Vertex embedding input was truncated by the provider')
  const rawTokenCount =
    usage && typeof usage === 'object' && 'promptTokenCount' in usage
      ? usage.promptTokenCount
      : null
  const tokenCount =
    typeof rawTokenCount === 'number' ||
    (typeof rawTokenCount === 'string' && /^\d+$/u.test(rawTokenCount))
      ? Number(rawTokenCount)
      : null
  return {
    embedding: embedding.values,
    tokens:
      tokenCount !== null && Number.isSafeInteger(tokenCount) && tokenCount >= 0
        ? tokenCount
        : null,
  }
}
