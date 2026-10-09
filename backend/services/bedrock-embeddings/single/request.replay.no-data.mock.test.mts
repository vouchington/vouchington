import * as analytics from '@services/analytics'
import { loadRecordedResponse } from '@voucha/test-helpers/provider-replay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
  BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
  EMBEDDING_DIMENSION,
} from '../config.mts'
import { createBedrockEmbedding } from './request.mts'

// The recorded Bedrock responses are served through the real BedrockRuntimeClient's
// `requestHandler`, so the SDK serializes, signs and parses actual wire bytes. The live counterpart
// is the non-gating smoke check in ./__tests__/index.bedrock.test.mts. The success fixture follows
// the documented Nova response body (https://docs.aws.amazon.com/nova/latest/userguide/embeddings-schema.html),
// with the vector cut to 8 values: nothing here depends on its length.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('@voucha/test-helpers/provider-replay')
  return createProviderReplay()
})

vi.mock<typeof import('@aws-sdk/client-bedrock-runtime')>(
  import('@aws-sdk/client-bedrock-runtime'),
  async importOriginal => {
    const actual = await importOriginal()
    const { replayAwsClient } = await import('@voucha/test-helpers/aws-replay-request-handler')
    return { ...actual, BedrockRuntimeClient: replayAwsClient(actual.BedrockRuntimeClient, replay) }
  },
)

const TEXT = 'A concise semantic embedding smoke test.'

describe('createBedrockEmbedding against recorded Bedrock responses', () => {
  beforeEach(() => {
    // Without credentials the client falls back to the default chain and fails before signing.
    vi.stubEnv('BEDROCK_AWS_ACCESS_KEY_ID', 'AKIATESTFAKEKEYID000')
    vi.stubEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', 'fakeSecretKeyForTestingPurposesOnly00000')
    vi.stubEnv('REQUIRE_BEDROCK_INTEGRATION', 'false')
    vi.spyOn(analytics, 'trackAIEmbeddingCall')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('invokes the Nova model with our single text embedding request and parses the vector', async () => {
    replay.respondWith(loadRecordedResponse('bedrock/invoke-nova-embedding-text.http'))

    const result = await createBedrockEmbedding(TEXT, { entityType: 'search' })

    expect(result.embedding).toEqual([0.125, -0.0625, 0.25, 0.5, -0.375, 0.03125, -0.15625, 0.75])
    expect(replay.requests).toHaveLength(1)
    const sent = replay.requests[0]!
    expect(sent).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
    })
    expect(decodeURIComponent(new URL(sent.url).pathname)).toBe(
      `/model/${BEDROCK_NOVA_MULTIMODAL_MODEL_ID}/invoke`,
    )
    expect(sent.json()).toEqual({
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: EMBEDDING_DIMENSION,
        text: { truncationMode: 'END', value: TEXT },
      },
    })
    expect(analytics.trackAIEmbeddingCall).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        service: 'bedrock',
        model: BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
        success: true,
        entityType: 'search',
        invocation: 'single',
      }),
    )
    replay.assertDrained()
  })

  it('records a failed call and rethrows the provider error when Bedrock rejects the request', async () => {
    replay.respondWith(loadRecordedResponse('bedrock/invoke-validation-exception-400.http'))

    const error: unknown = await createBedrockEmbedding(TEXT, { entityType: 'post' }).catch(
      (err: unknown) => err,
    )

    expect(error).toMatchObject({ name: 'ValidationException' })
    expect(analytics.trackAIEmbeddingCall).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        service: 'bedrock',
        model: BEDROCK_NOVA_MULTIMODAL_MODEL_NAME,
        tokens: 0,
        success: false,
        errorType: (error as Error).message,
        entityType: 'post',
        invocation: 'single',
      }),
    )
    expect(error).not.toHaveProperty('tags')
    replay.assertDrained()
  })

  it('suppresses logging for an access-denied error when the integration is optional', async () => {
    replay.respondWith(loadRecordedResponse('bedrock/invoke-access-denied-403.http'))

    await expect(createBedrockEmbedding(TEXT, { entityType: 'post' })).rejects.toMatchObject({
      name: 'AccessDeniedException',
      tags: { suppressLogging: true },
    })
    replay.assertDrained()
  })

  it('keeps logging an access-denied error when the integration is required', async () => {
    vi.stubEnv('REQUIRE_BEDROCK_INTEGRATION', 'true')
    replay.respondWith(loadRecordedResponse('bedrock/invoke-access-denied-403.http'))

    const error: unknown = await createBedrockEmbedding(TEXT, { entityType: 'post' }).catch(
      (err: unknown) => err,
    )

    expect(error).toMatchObject({ name: 'AccessDeniedException' })
    expect(error).not.toHaveProperty('tags')
    replay.assertDrained()
  })
})
