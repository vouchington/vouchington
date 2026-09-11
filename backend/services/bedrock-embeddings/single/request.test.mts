import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_EMBEDDING_TEXT_LENGTH } from '../config.mts'
import { createBedrockEmbedding } from './request.mts'

describe('createBedrockEmbedding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the Nova multimodal single text embedding request', async () => {
    const embedding = new Array(1024).fill(0.25)
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({ embeddings: [{ embedding }], inputTokenCount: 7 }),
      ),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })

    const result = await createBedrockEmbedding('hello world', { entityType: 'post' })

    expect(result.embedding).toEqual(embedding)
    expect(result.tokens).toBe(7)
    expect(send).toHaveBeenCalledOnce()

    const command = send.mock.calls[0][0] as { input: { modelId: string; body: string } }
    expect(command.input.modelId).toBe('amazon.nova-2-multimodal-embeddings-v1:0')
    const body = JSON.parse(command.input.body)
    expect(body).toEqual({
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: 1024,
        text: {
          truncationMode: 'END',
          value: 'hello world',
        },
      },
    })
  })

  it('forwards a caller abort signal to the Bedrock SDK request', async () => {
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify({ embedding: new Array(1024).fill(0.2) })),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })
    const abortSignal = new AbortController().signal

    await createBedrockEmbedding('bounded search', { entityType: 'search', abortSignal })

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.anything(), { abortSignal })
  })

  it('truncates over-limit text before sending to Bedrock', async () => {
    const embedding = new Array(1024).fill(0.1)
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({ embeddings: [{ embedding }], inputTokenCount: 3 }),
      ),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })

    const longText = 'word '.repeat(MAX_EMBEDDING_TEXT_LENGTH)
    await createBedrockEmbedding(longText, { entityType: 'rss_feed_item' })

    const command = send.mock.calls[0][0] as { input: { body: string } }
    const body = JSON.parse(command.input.body)
    expect(body.singleEmbeddingParams.text.value.length).toBeLessThanOrEqual(
      MAX_EMBEDDING_TEXT_LENGTH,
    )
  })
})
