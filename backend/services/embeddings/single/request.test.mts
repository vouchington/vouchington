import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { createEmbedding } from './request.mts'

const vector = new Array(1536).fill(0.125)

function mockVertexIdentity(agent: MockAgent) {
  vi.stubEnv('AWS_PROFILE', undefined)
  vi.stubEnv('AWS_DEFAULT_PROFILE', undefined)
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIATESTGEMINI')
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'synthetic-secret')
  vi.stubEnv('AWS_SESSION_TOKEN', 'synthetic-session')
  vi.stubEnv('AWS_REGION', 'us-west-2')
  vi.stubEnv('VERTEX_LOCATION', 'us')
  vi.stubEnv('VERTEX_PROJECT_ID', 'synthetic-project')
  vi.stubEnv('VERTEX_PROJECT_NUMBER', '123456')
  vi.stubEnv('VERTEX_WIF_POOL_ID', 'synthetic-pool')
  vi.stubEnv('VERTEX_WIF_PROVIDER_ID', 'synthetic-provider')
  vi.stubEnv('VERTEX_SERVICE_ACCOUNT_EMAIL', 'embeddings@synthetic-project.iam.gserviceaccount.com')
  agent
    .get('https://sts.googleapis.com')
    .intercept({ method: 'POST', path: '/v1/token' })
    .reply(200, {
      access_token: 'synthetic-federated-token',
      expires_in: 3600,
      token_type: 'Bearer',
    })
    .persist()
  agent
    .get('https://iamcredentials.googleapis.com')
    .intercept({ method: 'POST', path: /:generateAccessToken$/ })
    .reply(200, {
      accessToken: 'synthetic-vertex-token',
      expireTime: '2099-01-01T00:00:00Z',
    })
    .persist()
}

describe('Vertex embedding HTTP boundary', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('exchanges AWS identity and embeds queries with reduced dimensions', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    mockVertexIdentity(agent)
    agent
      .get('https://aiplatform.us.rep.googleapis.com')
      .intercept({
        method: 'POST',
        path: '/v1/projects/synthetic-project/locations/us/publishers/google/models/gemini-embedding-2:embedContent',
        body: JSON.stringify({
          content: { parts: [{ text: 'task: search result | query: synthetic query' }] },
          embedContentConfig: { outputDimensionality: 1536 },
        }),
        headers: { authorization: 'Bearer synthetic-vertex-token' },
      })
      .reply(200, { embedding: { values: vector }, usageMetadata: { promptTokenCount: 4 } })
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        await expect(createEmbedding('synthetic query', { entityType: 'search' })).resolves.toEqual(
          { embedding: vector, tokens: 4 },
        )
      })
      agent.assertNoPendingInterceptors()
    } finally {
      await agent.close()
    }
  })

  it('rejects provider errors and missing vectors', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    mockVertexIdentity(agent)
    agent
      .get('https://aiplatform.us.rep.googleapis.com')
      .intercept({ method: 'POST', path: /:embedContent$/ })
      .reply(400, { error: 'invalid input' })
    agent
      .get('https://aiplatform.us.rep.googleapis.com')
      .intercept({ method: 'POST', path: /:embedContent$/ })
      .reply(200, {})
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        await expect(createEmbedding('document')).rejects.toThrow(
          'Vertex embedding request failed (400)',
        )
        await expect(createEmbedding('document')).rejects.toThrow('did not include an embedding')
      })
    } finally {
      await agent.close()
    }
  })
  it('fails blank project configuration and honors an already-aborted caller before authentication', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    mockVertexIdentity(agent)
    try {
      await withMockAgentDefaultFetchForTest(agent, async () => {
        const reason = new Error('synthetic caller cancellation')
        await expect(
          createEmbedding('query', {
            entityType: 'search',
            abortSignal: AbortSignal.abort(reason),
          }),
        ).rejects.toBe(reason)
        vi.stubEnv('VERTEX_PROJECT_ID', '')
        await expect(createEmbedding('query')).rejects.toThrow('VERTEX_PROJECT_ID is required')
      })
    } finally {
      await agent.close()
    }
  })
})
