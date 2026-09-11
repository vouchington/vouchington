import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { processAgentResponse, WORKER_DEADLINE_MS } from './process-agent-response.mts'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { createAgentResponse } from '@services/agent-responses/create'
import { getAgentResponseById } from '@services/agent-responses/get'
import {
  updateAgentResponseCompleted,
  updateAgentResponseFailed,
  cancelAgentResponse,
} from '@services/agent-responses/update'
import {
  createDeferred,
  disableOpenAiSpendCapForTests,
  makeJob,
  makeNoTextStream,
  makeTextResponse,
  subscribeAgentResponseEventLog,
} from './process-agent-response.test-helpers.mts'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(async function* () {
      yield* []
      throw new Error('streamOpenAIResponse mock not configured for this test')
    }),
  }),
)

import { streamOpenAIResponse, type OpenAIResponse } from '@modules/openai-utils/create-response'

type ResponseStream = AsyncGenerator<{ delta: string }, OpenAIResponse>

describe('processAgentResponse', () => {
  let user: PrivateUser
  let restoreSpendCapConfig: () => void

  beforeAll(async () => {
    user = await createTestUser()
    restoreSpendCapConfig = await disableOpenAiSpendCapForTests()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    restoreSpendCapConfig()
  })

  it('skips processing when agentResponse is not found', async () => {
    const job = makeJob('00000000-0000-7000-8000-000000000011')
    await expect(processAgentResponse(job)).resolves.toBeUndefined()
    expect(streamOpenAIResponse).not.toHaveBeenCalled()
  })

  it('skips processing when agentResponse is already completed', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Already done' },
    })
    await updateAgentResponseCompleted(agentResponse.id, { content: 'done' }, 'no_tool_calls')

    const job = makeJob(agentResponse.id)
    await expect(processAgentResponse(job)).resolves.toBeUndefined()
    expect(streamOpenAIResponse).not.toHaveBeenCalled()
  })

  it('skips provider work when agentResponse failed before the worker claim', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Already failed' },
    })
    await updateAgentResponseFailed(agentResponse.id, { message: 'pre-fail' }, 'error')

    const job = makeJob(agentResponse.id)
    await expect(processAgentResponse(job)).resolves.toBeUndefined()
    expect(streamOpenAIResponse).not.toHaveBeenCalled()
  })

  it('skips provider work when agentResponse was deleted before the worker claim', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Already deleted' },
    })
    await cancelAgentResponse(agentResponse.id)

    const job = makeJob(agentResponse.id)
    await expect(processAgentResponse(job)).resolves.toBeUndefined()
    expect(streamOpenAIResponse).not.toHaveBeenCalled()
  })

  it('completes agentResponse when streamResearchResponse returns text', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'What is the best travel card?' },
    })

    vi.mocked(streamOpenAIResponse).mockImplementationOnce(
      makeNoTextStream(makeTextResponse('resp_1', 'The Chase Sapphire Reserve is excellent.')),
    )

    const job = makeJob(agentResponse.id)
    await processAgentResponse(job)

    const updated = await getAgentResponseById(agentResponse.id)
    expect(updated?.completed_at).not.toBeNull()
    expect(updated?.output?.content).toBe('The Chase Sapphire Reserve is excellent.')
    expect(updated?.termination_reason).toBe('no_tool_calls')
  }, 15_000)

  it('fails agentResponse when streamOpenAIResponse throws a generic error', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Task that errors' },
    })

    const testError = new Error('API error')
    Object.assign(testError, { tags: { suppressLogging: true } })
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      yield* []
      throw testError
    })

    const job = makeJob(agentResponse.id)
    await processAgentResponse(job)

    const updated = await getAgentResponseById(agentResponse.id)
    expect(updated?.failed_at).not.toBeNull()
    expect(updated?.termination_reason).toBe('error')
  }, 15_000)

  it('sets termination_reason to stalled when AbortError is thrown', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Task that aborts' },
    })

    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      yield* []
      throw abortError
    })

    const job = makeJob(agentResponse.id)
    await processAgentResponse(job)

    const updated = await getAgentResponseById(agentResponse.id)
    expect(updated?.failed_at).not.toBeNull()
    expect(updated?.termination_reason).toBe('stalled')
  }, 15_000)

  it('sets termination_reason to stalled when TimeoutError is thrown', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Timeout test' },
    })

    const timeoutError = new Error('Timed out')
    timeoutError.name = 'TimeoutError'
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      yield* []
      throw timeoutError
    })

    const job = makeJob(agentResponse.id)
    await processAgentResponse(job)

    const updated = await getAgentResponseById(agentResponse.id)
    expect(updated?.termination_reason).toBe('stalled')
  }, 15_000)

  it('exercises the abort signal interval when job has an abort signal', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Signal abort test' },
    })

    // Assign resolveResponse synchronously so it's available regardless of when the mock is called.
    // The generator awaits an external promise to avoid a race with real DB calls that complete
    // before the mock is first invoked.
    const pendingResponse = createDeferred()
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      await pendingResponse.promise
      yield* []
      return makeTextResponse('resp_abort', 'Aborted result')
    })

    // Start process with abort signal — setInterval fires in 500ms
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const processPromise = processAgentResponse(makeJob(agentResponse.id, [{ name: 'abort' }]))

    // Advance 600ms so the setInterval fires and calls abortController.abort()
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()

    // Unblock the pending stream after the interval has fired
    pendingResponse.resolve()

    await processPromise
    const updated = await getAgentResponseById(agentResponse.id)
    // Either completed or failed — the signal path was exercised
    expect(updated?.completed_at ?? updated?.failed_at).toBeTruthy()
  }, 15_000)

  it('does not publish completion when a concurrent failure wins the terminal transition', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Concurrent failure' },
    })
    const { events, subscription } = await subscribeAgentResponseEventLog(agentResponse.id)
    const streamStarted = createDeferred()
    const streamReleased = createDeferred()
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      streamStarted.resolve()
      await streamReleased.promise
      yield* []
      return makeTextResponse('resp_late_completion', 'Late completion')
    })

    try {
      const processPromise = processAgentResponse(makeJob(agentResponse.id))
      await streamStarted.promise
      await updateAgentResponseFailed(agentResponse.id, { message: 'Failure won' }, 'error')
      streamReleased.resolve()
      await processPromise

      const updated = await getAgentResponseById(agentResponse.id)
      expect(updated).toMatchObject({
        completed_at: null,
        error: { message: 'Failure won' },
        termination_reason: 'error',
      })
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'done' }))
    } finally {
      await subscription.close()
    }
  }, 15_000)

  it('does not publish failure when a concurrent completion wins the terminal transition', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Concurrent completion' },
    })
    const { events, subscription } = await subscribeAgentResponseEventLog(agentResponse.id)
    const streamStarted = createDeferred()
    const streamResult = createDeferred()
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      streamStarted.resolve()
      await streamResult.promise
      yield* []
      throw new Error('unreachable')
    })

    try {
      const processPromise = processAgentResponse(makeJob(agentResponse.id))
      await streamStarted.promise
      await updateAgentResponseCompleted(
        agentResponse.id,
        { content: 'Completion won' },
        'no_tool_calls',
      )
      const lateError = new Error('Late failure')
      Object.assign(lateError, { tags: { suppressLogging: true } })
      streamResult.reject(lateError)
      await processPromise

      const updated = await getAgentResponseById(agentResponse.id)
      expect(updated).toMatchObject({
        error: null,
        output: { content: 'Completion won' },
        termination_reason: 'no_tool_calls',
      })
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'error' }))
    } finally {
      await subscription.close()
    }
  }, 15_000)
})

describe('WORKER_DEADLINE_MS', () => {
  it('is 8 minutes', () => {
    expect(WORKER_DEADLINE_MS).toBe(8 * 60 * 1000)
  })
})
