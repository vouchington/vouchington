import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'
import { trackAIEmbeddingCall } from '@services/analytics'
import {
  BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
  BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
  EMBEDDING_DIMENSION,
  truncateEmbeddingText,
} from '../config.mts'
import { shouldSkipUnavailableBedrockIntegration } from '../test-availability.mts'

type CreateBedrockEmbeddingOptions = {
  entityType: 'post' | 'topic' | 'rss_feed_item' | 'crawl_chunk' | 'search' | 'support_message'
  abortSignal?: AbortSignal
}

type BedrockEmbeddingResponse = {
  embedding?: number[]
  embeddings?: Array<{ embedding: number[] } | number[]>
  inputTokenCount?: number
}

type BedrockEmbeddingResult = {
  embedding: number[]
  tokens: number | null
}

export const createBedrockEmbedding = async (
  text: string,
  options?: CreateBedrockEmbeddingOptions,
) => {
  const start = Date.now()
  try {
    const result = await requestBedrockEmbedding(text, options?.abortSignal)
    trackAIEmbeddingCall({
      service: 'bedrock',
      model: BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
      tokens: result.tokens ?? 0,
      durationMs: Date.now() - start,
      success: true,
      entityType: options?.entityType || 'unknown',
      invocation: 'single',
    })
    return result
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      process.env.NODE_ENV === 'test' &&
      shouldSkipUnavailableBedrockIntegration(error)
    ) {
      Object.assign(error, { tags: { suppressLogging: true } })
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
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
    throw error
  }
}

/* no-mistakes: integration=bedrock */
async function requestBedrockEmbedding(
  text: string,
  abortSignal?: AbortSignal,
): Promise<BedrockEmbeddingResult> {
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
          value: truncateEmbeddingText(text),
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
    tokens: Number.isFinite(parsed.inputTokenCount) ? parsed.inputTokenCount! : null,
  }
}

function extractEmbedding(
  value: { embedding: number[] } | number[] | undefined,
): number[] | undefined {
  if (Array.isArray(value)) return value
  return value?.embedding
}
