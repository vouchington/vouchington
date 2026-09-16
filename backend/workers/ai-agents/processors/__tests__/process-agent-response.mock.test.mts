import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, setAgentResponseStartedAt, softDeleteUser } from '@voucha/test-helpers'
import { createAgentResponse } from '@services/agent-responses/create'
import { getAgentResponseById } from '@services/agent-responses/get'
import {
  RUNTIME_GENERATION_INTERRUPTED_ERROR,
  RUNTIME_GENERATION_INTERRUPTED_SIGNAL,
} from '@services/agent-responses/reconcile-runtime-generations'
import { processAgentResponse } from '../process-agent-response.mts'
import {
  processReconcileRuntimeGenerations,
  type ReconcileRuntimeGenerationDeps,
} from '../process-reconcile-runtime-generations.mts'
import {
  createDeferred,
  makeJob,
  makeTextResponse,
  subscribeAgentResponseEventLog,
} from '../process-agent-response.test-helpers.mts'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(async function* () {
      yield* []
      throw new Error('streamOpenAIResponse mock not configured for this test')
    }),
  }),
)

import { streamOpenAIResponse, type OpenAIResponse } from '@modules/openai-utils/create-response'

type ResponseStream = AsyncGenerator<{ delta: string }, OpenAIResponse>

describe('processAgentResponse durable claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs provider work only once for concurrent same-ID deliveries', async () => {
    const user = await createTestUser()
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Duplicate worker delivery' },
    })
    const pendingResponse = createDeferred()
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      await pendingResponse.promise
      yield* []
      return makeTextResponse('resp_duplicate', 'One response')
    })

    const firstDelivery = processAgentResponse(makeJob(agentResponse.id))
    await vi.waitFor(() => expect(streamOpenAIResponse).toHaveBeenCalledTimes(1))
    await expect(processAgentResponse(makeJob(agentResponse.id))).resolves.toBeUndefined()
    expect(streamOpenAIResponse).toHaveBeenCalledTimes(1)

    pendingResponse.resolve()
    await firstDelivery
  })

  it('fails a claimed response when its owner is no longer available', async () => {
    const deletedUser = await createTestUser()
    const agentResponse = await createAgentResponse({
      createdById: deletedUser.id,
      agent: 'research',
      input: { task: 'Missing owner' },
    })
    await softDeleteUser(deletedUser.id)
    const { events, subscription } = await subscribeAgentResponseEventLog(agentResponse.id)

    try {
      await expect(processAgentResponse(makeJob(agentResponse.id))).resolves.toBeUndefined()

      expect(streamOpenAIResponse).not.toHaveBeenCalled()
      await expect(getAgentResponseById(agentResponse.id)).resolves.toMatchObject({
        failed_at: expect.any(Date),
        error: { message: 'The response could not start. Please try again.' },
        termination_reason: 'error',
      })
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'error',
          error: 'The response could not start. Please try again.',
        }),
      )
    } finally {
      await subscription.close()
    }
  })

  it('persists and publishes the shared interruption error when the worker wins', async () => {
    const user = await createTestUser()
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Interrupted worker' },
    })
    const { events, subscription } = await subscribeAgentResponseEventLog(agentResponse.id)
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (_params, options) {
      yield* []
      await new Promise<void>(resolve =>
        options?.signal?.addEventListener('abort', () => resolve()),
      )
      options?.signal?.throwIfAborted()
      return makeTextResponse('unreachable', 'unreachable')
    })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    try {
      const processPromise = processAgentResponse(
        makeJob(agentResponse.id, [{ name: RUNTIME_GENERATION_INTERRUPTED_SIGNAL }]),
      )
      await vi.waitFor(() => expect(streamOpenAIResponse).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(500)
      await processPromise

      await expect(getAgentResponseById(agentResponse.id)).resolves.toMatchObject({
        error: { message: RUNTIME_GENERATION_INTERRUPTED_ERROR },
        termination_reason: 'stalled',
      })
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'error',
          error: RUNTIME_GENERATION_INTERRUPTED_ERROR,
        }),
      )
    } finally {
      vi.useRealTimers()
      await subscription.close()
    }
  })

  it('does not publish interruption when the database reconciler wins', async () => {
    const user = await createTestUser()
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Database interruption wins' },
    })
    const { events, subscription } = await subscribeAgentResponseEventLog(agentResponse.id)
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (_params, options) {
      yield* []
      await new Promise<void>(resolve =>
        options?.signal?.addEventListener('abort', () => resolve()),
      )
      options?.signal?.throwIfAborted()
      return makeTextResponse('unreachable', 'unreachable')
    })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    try {
      const processPromise = processAgentResponse(
        makeJob(agentResponse.id, [{ name: RUNTIME_GENERATION_INTERRUPTED_SIGNAL }]),
      )
      await vi.waitFor(() => expect(streamOpenAIResponse).toHaveBeenCalledOnce())
      const startedAt = new Date('1901-01-01T00:00:00Z')
      await setAgentResponseStartedAt(agentResponse.id, startedAt)
      await processReconcileRuntimeGenerations({
        getStaleRuntimeGenerationJobs: vi.fn<
          ReconcileRuntimeGenerationDeps['getStaleRuntimeGenerationJobs']
        >(async () => ({
          cutoff: new Date('2000-01-01T00:00:00Z'),
          candidates: [
            {
              kind: 'agent-response',
              id: agentResponse.id,
              signalJobId: `agent-response_${agentResponse.id}`,
              startedAt,
            },
          ],
        })),
        signalJob: vi.fn<ReconcileRuntimeGenerationDeps['signalJob']>(async () => undefined),
      })
      await vi.advanceTimersByTimeAsync(500)
      await processPromise

      await vi.waitFor(() =>
        expect(events).toEqual([{ type: 'error', error: RUNTIME_GENERATION_INTERRUPTED_ERROR }]),
      )
      await expect(getAgentResponseById(agentResponse.id)).resolves.toMatchObject({
        error: { message: RUNTIME_GENERATION_INTERRUPTED_ERROR },
        termination_reason: 'stalled',
      })
    } finally {
      vi.useRealTimers()
      await subscription.close()
    }
  })
})
