import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'
import { trackAIEmbeddingCall } from '@services/analytics'
import {
  BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
  BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
  EMBEDDING_DIMENSION,
  NOVA_EMBEDDING_CHARACTERS_PER_TOKEN,
  truncateEmbeddingText,
} from '../config.mts'
import { shouldSkipUnavailableBedrockIntegration } from '../test-availability.mts'

type CreateBedrockEmbeddingOptions = {
  entityType: 'post' | 'topic' | 'rss_feed_item' | 'crawl_chunk' | 'search'
  abortSignal?: AbortSignal
}

type BedrockEmbeddingResponse = {
  embedding?: number[]
  embeddings?: Array<{ embedding: number[] } | number[]>
}

type BedrockEmbeddingResult = {
  embedding: number[]
  tokens: number | null
}

export const createBedrockEmbedding = async (
  text: string,
  options?: CreateBedrockEmbeddingOptions,
): Promise<BedrockEmbeddingResult> => {
  const start = Date.now()
  try {
    const result = await requestBedrockEmbedding(text, options?.abortSignal)
    trackAIEmbeddingCall({
      service: 'bedrock',
      model: BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
      tokens: result.estimatedTokens,
      durationMs: Date.now() - start,
      success: true,
      entityType: options?.entityType || 'unknown',
      invocation: 'single',
    })
    // Stored token counts represent provider usage; the estimate is analytics-only.
    return { embedding: result.embedding, tokens: null }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      process.env.NODE_ENV === 'test' &&
      shouldSkipUnavailableBedrockIntegration(err)
    ) {
      Object.assign(err, { tags: { suppressLogging: true } })
    }
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    trackAIEmbeddingCall({
      service: 'bedrock',
      model: BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
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

/* no-mistakes: integration=bedrock */
async function requestBedrockEmbedding(
  text: string,
  abortSignal?: AbortSignal,
): Promise<{ embedding: number[]; estimatedTokens: number }> {
  const inputText = truncateEmbeddingText(text)
  const command = new InvokeModelCommand({
    modelId: BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: EMBEDDING_DIMENSION,
        text: {
          truncationMode: 'END',
          value: inputText,
        },
      },
    }),
  })
  const response = await BedrockEmbeddingsClient.send(
    command,
    abortSignal ? { abortSignal } : undefined,
  )
  if (!response.body) {
    throw new Error('Bedrock embedding response body is empty')
  }

  const body = new TextDecoder().decode(response.body)
  const parsed = JSON.parse(body) as BedrockEmbeddingResponse
  const embedding = parsed.embedding ?? extractEmbedding(parsed.embeddings?.[0])
  if (!embedding) {
    throw new Error('Bedrock embedding response did not include an embedding')
  }

  return {
    embedding,
    estimatedTokens: Math.ceil(inputText.length / NOVA_EMBEDDING_CHARACTERS_PER_TOKEN),
  }
}

function extractEmbedding(
  value: { embedding: number[] } | number[] | undefined,
): number[] | undefined {
  if (Array.isArray(value)) return value
  return value?.embedding
}
