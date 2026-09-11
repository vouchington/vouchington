import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { createAgentResponse } from '@services/agent-responses/create'
import { openAiSpendCapConfig } from '@services/ai-usage'

vi.mock<typeof import('@modules/openai-utils/moderate')>(
  import('@modules/openai-utils/moderate'),
  async importOriginal => ({
    ...(await importOriginal()),
    requestOpenAIModeration: vi.fn<VitestLooseMock>(() =>
      Promise.resolve({
        results: [
          {
            flagged: false,
            categories: {},
            category_scores: {},
            category_applied_input_types: {},
          },
        ],
      }),
    ),
  }),
)

const mockResponse = {
  id: 'resp_test',
  output: [
    {
      id: 'resp_test-message',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Mocked research result', annotations: [] }],
    },
  ],
}

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(() => Promise.resolve(mockResponse)),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(async function* () {
      yield* []
      return mockResponse
    }),
  }),
)

// Start the ai_agents worker in-process so the POST enqueue is actually consumed
import '@workers/ai-agents/workers'

describe('POST /api/v1/agent-responses', () => {
  let user: PrivateUser
  let restoreSpendCapConfig: () => void

  beforeAll(async () => {
    user = await createTestUser()
    // This describe block exercises SSE/job-dispatch mechanics via a real in-process worker, not
    // spend accounting -- disable the cap so it isn't tripped by real spend other files in the
    // shared, un-truncated-between-files test DB record for "today" (the cap's own behavior is
    // covered by automod-simulate.test.mts, contact-drafts.test.mts, conversations.title.mock.test.mts,
    // and spend-cap-guard.test.mts).
    await openAiSpendCapConfig.waitForInitialization()
    restoreSpendCapConfig = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      enabled: false,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    restoreSpendCapConfig()
  })

  it('returns 415 for non-JSON Content-Type', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'text/plain')
      .send('hello')
      .expect(415)
  })

  it('returns 401 without auth', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'test task' })
      .expect(401)
  })

  it('returns 400 for non-object body', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify([]))
      .expect(400)
  })

  it('returns 400 when agent is not "research"', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'unknown', task: 'test' })
      .expect(400)
  })

  it('returns 400 when task is not a string', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 123 })
      .expect(400)
  })

  it('returns 400 when task is empty', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: '   ' })
      .expect(400)
  })

  it('returns 400 when task exceeds max length', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'a'.repeat(8193) })
      .expect(400)
  })

  it('returns 400 when context is not a string', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'valid task', context: 123 })
      .expect(400)
  })

  it('returns 200 SSE stream with metadata event on valid request', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'What is the best travel card?' })
      .expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toContain('event: metadata')
    expect(response.text).toContain('agent_response_id')
    const metadataEvents = response.text
      .split('\n\n')
      .filter(frame => frame.startsWith('event: metadata\n'))
      .map(frame => JSON.parse(frame.split('\ndata: ')[1]!) as Record<string, unknown>)
    expect(metadataEvents[0]).toMatchObject({
      agent_response_id: expect.any(String),
      job_id: null,
      agent: 'research',
    })
    expect(metadataEvents.at(-1)).toMatchObject({
      agent_response_id: metadataEvents[0]!.agent_response_id,
      job_id: expect.any(String),
      agent: 'research',
    })
  }, 30_000)

  it('accepts context field when it is a string', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'Best card for travel?', context: 'User has 700 score' })
      .expect(200)

    expect(response.text).toContain('event: metadata')
  }, 30_000)

  it('accepts null context field', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req
      .post('/api/v1/agent-responses')
      .set('Content-Type', 'application/json')
      .send({ agent: 'research', task: 'Best cashback card?', context: null })
      .expect(200)

    expect(response.text).toContain('event: metadata')
  }, 30_000)
})

describe('GET /api/v1/agent-responses/:id', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 without auth', async () => {
    const req = createRequest()
    await req.get('/api/v1/agent-responses/00000000-0000-7000-8000-000000000001').expect(401)
  })

  it('returns 404 for nonexistent agent response', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req.get('/api/v1/agent-responses/00000000-0000-7000-8000-000000000001').expect(404)
  })

  it('returns 200 with agent_response for the owner', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'GET test task' },
    })

    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}`).expect(200)

    expect(response.body).toMatchObject({
      agent_response: expect.objectContaining({ id: agentResponse.id }),
    })
  })

  it('returns 403 when another user tries to access the response', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Access denied test' },
    })

    const req = createRequest()
    await req.authenticateAs(otherUser)
    await req.get(`/api/v1/agent-responses/${agentResponse.id}`).expect(403)
  })
})
