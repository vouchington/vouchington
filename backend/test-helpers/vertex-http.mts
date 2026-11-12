import { inject, onTestFinished, vi, type Mock } from 'vitest'
import {
  installMockAgentDefaultFetchForTest,
  MockAgent,
  withMockAgentDefaultFetchForTest,
} from './provider-http.mts'

/** Synthetic HTTP responses around the real AWS WIF signer, Google STS/IAM and Vertex callers. */
export type VertexHttpFixture = {
  agent: MockAgent
  run: <T>(operation: () => Promise<T>) => Promise<T>
  activate: () => () => void
  embeddingResponse: (values: unknown, tokenCount?: number) => Mock<() => void>
  batchCreationResponses: (options?: {
    onUpload?: () => Promise<void> | void
    onSubmit?: () => Promise<string> | string
  }) => { uploads: Mock<() => void>; submissions: Mock<() => void> }
}
export function createVertexHttpFixture(): VertexHttpFixture {
  vi.stubEnv('AWS_PROFILE', undefined)
  vi.stubEnv('AWS_DEFAULT_PROFILE', undefined)
  const emulator = inject('awsEmulator')
  const passthroughOrigins = emulator ? [new URL(emulator.endpoint).origin] : []
  const binaryBodyOrigins = ['https://storage.googleapis.com']
  const agent = new MockAgent()
  agent.disableNetConnect()
  const environment = {
    AWS_ACCESS_KEY_ID: 'AKIATESTGEMINI',
    AWS_SECRET_ACCESS_KEY: 'synthetic-secret',
    AWS_SESSION_TOKEN: 'synthetic-session',
    AWS_REGION: 'us-west-2',
    VERTEX_LOCATION: 'us',
    VERTEX_PROJECT_ID: 'synthetic-project',
    VERTEX_PROJECT_NUMBER: '123456',
    VERTEX_WIF_POOL_ID: 'synthetic-pool',
    VERTEX_WIF_PROVIDER_ID: 'synthetic-provider',
    VERTEX_SERVICE_ACCOUNT_EMAIL: 'embeddings@example.iam.gserviceaccount.com',
    VERTEX_BATCH_BUCKET: 'synthetic-embeddings',
  }
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
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
  onTestFinished(async () => {
    await agent.close()
    vi.unstubAllEnvs()
  })
  return {
    agent,
    run: <T,>(operation: () => Promise<T>) =>
      withMockAgentDefaultFetchForTest(agent, operation, passthroughOrigins, binaryBodyOrigins),
    activate: () =>
      installMockAgentDefaultFetchForTest(agent, passthroughOrigins, binaryBodyOrigins),
    embeddingResponse(values: unknown, tokenCount?: number) {
      const received = vi.fn<() => void>()
      agent
        .get('https://aiplatform.us.rep.googleapis.com')
        .intercept({ method: 'POST', path: /:embedContent$/ })
        .reply(200, () => {
          received()
          return {
            embedding: { values },
            ...(tokenCount === undefined
              ? {}
              : { usageMetadata: { promptTokenCount: tokenCount } }),
          }
        })
      return received
    },
    batchCreationResponses(options = {}) {
      const uploads = vi.fn<() => void>()
      const submissions = vi.fn<() => void>()
      agent
        .get('https://storage.googleapis.com')
        .intercept({ method: 'POST', path: /\/upload\/storage\/v1\/b\/[^/]+\/o\?/ })
        .reply(async () => {
          uploads()
          await options.onUpload?.()
          return { statusCode: 200, data: {} }
        })
        .persist()
      let index = 0
      agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({ method: 'POST', path: /\/batchPredictionJobs$/ })
        .reply(async () => {
          submissions()
          const name =
            (await options.onSubmit?.()) ??
            `projects/synthetic-project/locations/us/batchPredictionJobs/test-${++index}`
          return { statusCode: 200, data: { name, state: 'JOB_STATE_PENDING' } }
        })
        .persist()
      return { uploads, submissions }
    },
  }
}
