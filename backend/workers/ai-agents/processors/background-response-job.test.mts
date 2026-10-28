import type { Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from 'openai'
import { Responses } from 'openai/resources/responses/responses'
import { makeSdkResponse } from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData, JobBackgroundResponse } from '@queues/ai-agents/types'
import {
  createBackgroundResponseJobContext,
  recoverJobBackgroundResponses,
} from './background-response-job.mts'

const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
const cancel = vi.spyOn(Responses.prototype, 'cancel')

const notFound = () =>
  APIError.generate(404, { error: { code: 'not_found' } }, 'not found', new Headers())
const running = () => makeSdkResponse({ id: 'resp_a', status: 'in_progress' })

function response(responseId: string): JobBackgroundResponse {
  return {
    responseId,
    agentSlug: 'story-post',
    communityId: null,
    postId: null,
    createdAt: '2026-10-27T12:00:00.000Z',
  }
}

function makeJob(name: string, saved: JobBackgroundResponse[] = []) {
  const job = {
    name,
    data: { backgroundResponses: saved } as AIAgentJobData,
    updateData: vi.fn<(data: AIAgentJobData) => Promise<void>>(async data => {
      job.data = data
    }),
    moveToDelayed: vi.fn<(until: number) => Promise<void>>(async () => undefined),
  }
  return job
}

describe('job-owned background responses', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'owned-recovery-provider-fixture')
    retrieve.mockReset()
    cancel.mockReset()
    cancel.mockResolvedValue(makeSdkResponse({ status: 'cancelled' }))
  })

  it('saves each response id once and clears it when settled', async () => {
    const job = makeJob('story-post')
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)

    await Promise.all([
      context.register(response('resp_a')),
      context.register(response('resp_a')),
      context.register(response('resp_b')),
    ])
    expect(job.data.backgroundResponses?.map(item => item.responseId)).toEqual(['resp_a', 'resp_b'])

    await context.settle('resp_a')
    expect(job.data.backgroundResponses?.map(item => item.responseId)).toEqual(['resp_b'])
  })

  it('reports a failed data update to the caller and keeps later updates usable', async () => {
    const job = makeJob('story-post')
    job.updateData.mockRejectedValueOnce(new Error('write failed'))
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)

    await expect(context.register(response('resp_a'))).rejects.toThrow('write failed')
    await context.register(response('resp_b'))
    expect(job.data.backgroundResponses?.map(item => item.responseId)).toEqual(['resp_b'])
  })

  it('settles saved ids for a replaying worker before it can pay again', async () => {
    retrieve.mockResolvedValue(running())
    const job = makeJob('story-post', [response('resp_a')])
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)

    await expect(
      recoverJobBackgroundResponses(job as unknown as Job<AIAgentJobData>, context),
    ).resolves.toBe(false)
    expect(cancel).toHaveBeenCalledExactlyOnceWith('resp_a', expect.anything())
    expect(job.data.backgroundResponses).toEqual([])
  })

  it('waits for started recovery before surfacing the original retrieval error', async () => {
    const first = Promise.withResolvers<Awaited<ReturnType<typeof retrieve>>>()
    const second = Promise.withResolvers<Awaited<ReturnType<typeof retrieve>>>()
    const bothStarted = Promise.withResolvers<void>()
    const failure = APIError.generate(
      429,
      { error: { code: 'rate_limit' } },
      'limited',
      new Headers(),
    )
    retrieve.mockImplementation(responseId => {
      if (responseId !== 'resp_a') bothStarted.resolve()
      const result = responseId === 'resp_a' ? first.promise : second.promise
      return result as ReturnType<typeof Responses.prototype.retrieve>
    })
    const job = makeJob('story-post', [response('resp_a'), response('resp_b')])
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)
    const recovery = recoverJobBackgroundResponses(job as unknown as Job<AIAgentJobData>, context)
    const outcome = recovery.then(
      () => 'resolved' as const,
      err => err,
    )

    await bothStarted.promise
    first.reject(failure)
    second.resolve(makeSdkResponse({ id: 'resp_b', status: 'failed' }))

    expect(await outcome).toBe(failure)
    expect(job.data.backgroundResponses?.map(item => item.responseId)).toEqual(['resp_a'])
  })

  it('rechecks later while an inline call response is still running', async () => {
    retrieve.mockResolvedValue(running())
    const job = makeJob('recover-background-response', [response('resp_a')])
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)

    await expect(
      recoverJobBackgroundResponses(job as unknown as Job<AIAgentJobData>, context),
    ).resolves.toBe(true)
    expect(cancel).not.toHaveBeenCalled()
    expect(job.moveToDelayed).toHaveBeenCalledOnce()
    expect(job.data.backgroundResponses).toHaveLength(1)
  })

  it('finishes an inline recovery job once its response has settled', async () => {
    retrieve.mockRejectedValue(notFound())
    const job = makeJob('recover-background-response', [response('resp_a')])
    const context = createBackgroundResponseJobContext(job as unknown as Job<AIAgentJobData>)

    await expect(
      recoverJobBackgroundResponses(job as unknown as Job<AIAgentJobData>, context),
    ).resolves.toBe(true)
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(job.data.backgroundResponses).toEqual([])
  })
})
