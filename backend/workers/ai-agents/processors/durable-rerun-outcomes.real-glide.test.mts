import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Job, Queue, QueueEvents, UnrecoverableError, Worker } from 'glide-mq'
import { ModelProviderError, type ModelCallResult } from '@vouchington/ai/providers'
import { disableSpendCapForTest } from '@voucha/test-helpers/ai-agents-spend-cap'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import { installAIAgentProviderFixtures } from '@voucha/test-helpers/ai-agent-worker-fixtures'
import { makeModelCallResult } from '@voucha/test-helpers/agents/model-call-result'
import { admitModerationRerunForTest } from '@voucha/test-helpers/moderation-rerun-worker'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME } from '@queues/ai-agents/config'
import type { AIAgentJobData, AIAgentJobPayloads } from '@queues/ai-agents/types'
import { markReportJudgementRunFailed } from '@services/moderation-reports/rerun-outcomes'
import { markAppealResolutionRunFailed } from '@services/moderation-appeals/rerun-outcomes'
import { withDurableRerunOutcome } from './durable-rerun-outcomes.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('durable moderation rerun terminal outcomes', () => {
  beforeEach(disableSpendCapForTest)

  it.each(['report', 'appeal'] as const)(
    'retries a failed %s terminal marker without replaying the processor',
    async kind => {
      const admitted = await admitModerationRerunForTest(kind)
      const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
      const queue = new Queue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME, connection)
      const events = new QueueEvents(AI_AGENTS_QUEUE_NAME, { ...connection, lastEventId: '0' })
      const delayed = Promise.withResolvers<void>()
      const completed = Promise.withResolvers<void>()
      const active = Promise.withResolvers<void>()
      let processCalls = 0
      let markerCalls = 0
      events.on('delay-changed', ({ jobId }: { jobId: string }) => {
        if (jobId === admitted.jobId) delayed.resolve()
      })
      await events.waitUntilReady()
      const worker = new Worker<AIAgentJobData>(
        AI_AGENTS_QUEUE_NAME,
        (job: Job<AIAgentJobData>) =>
          job.id === admitted.jobId
            ? withDurableRerunOutcome(
                job as NamedQueueJob<AIAgentJobPayloads>,
                async () => {
                  processCalls++
                  throw new UnrecoverableError('Owned permanent processor failure')
                },
                async run => {
                  markerCalls++
                  if (markerCalls === 1) throw new Error('Owned transient marker failure')
                  if (run.name === 'report-judgement')
                    await markReportJudgementRunFailed(
                      run.data.triggering_report_id,
                      run.data.run_id!,
                    )
                  else if (run.name === 'appeal-resolution')
                    await markAppealResolutionRunFailed(
                      run.data.appeal_id,
                      run.data.ai_draft_request_token,
                    )
                },
              )
            : Promise.resolve(),
        { ...connection, blockTimeout: 100, promotionInterval: 100 },
      )
      worker.on('completed', job => {
        if (job.id === admitted.jobId) completed.resolve()
      })
      worker.on('active', job => {
        if (job.id === admitted.jobId) active.resolve()
      })
      onTestFinished(async () => {
        await worker.close(true)
        await events.close()
        await queue.obliterate({ force: true })
        await queue.close()
      })
      await worker.waitUntilReady()
      await waitForRealGlideEvent(active.promise, `${kind} terminal marker worker activation`)
      await waitForRealGlideEvent(delayed.promise, `${kind} marker persistence deferral`)
      expect(processCalls).toBe(1)
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'active',
      )
      const parked = await queue.getJob(admitted.jobId)
      expect(parked?.data).toHaveProperty('step', 'persist-moderation-rerun-terminal-failure')
      await parked!.promote()
      await waitForRealGlideEvent(completed.promise, `${kind} persisted terminal marker`)
      expect(processCalls).toBe(1)
      expect(markerCalls).toBe(2)
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'failed',
      )
    },
  )

  it.each(['report', 'appeal'] as const)(
    'records an unrecoverable %s failure before the attempt budget is exhausted',
    async kind => {
      const provider = installAIAgentProviderFixtures()
      const admitted = await admitModerationRerunForTest(kind)
      const entered = Promise.withResolvers<void>()
      const response = Promise.withResolvers<ModelCallResult<never>>()
      provider.json.set(admitted.providerKey, [
        () => {
          entered.resolve()
          return response.promise
        },
      ])
      const runtime = await startAIAgentWorkerForTest()
      const failed = Promise.withResolvers<Job>()
      runtime.worker.on('failed', (job: Job | undefined) => {
        if (job?.id === admitted.jobId) failed.resolve(job)
      })
      await waitForRealGlideEvent(entered.promise, `${kind} permanent failure entry`)
      response.reject(
        new ModelProviderError('client-unavailable', 'Owned credential failure', {
          retryClass: 'permanent',
        }),
      )
      await waitForRealGlideEvent(failed.promise, `${kind} unrecoverable failure`)
      expect(provider.generateJson).toHaveBeenCalledOnce()
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'failed',
      )
    },
  )

  it.each(['report', 'appeal'] as const)(
    'keeps %s retries active and retains exhaustion after native job removal',
    async kind => {
      const provider = installAIAgentProviderFixtures()
      const admitted = await admitModerationRerunForTest(kind)
      const attempts = Array.from({ length: 3 }, () => ({
        entered: Promise.withResolvers<void>(),
        response: Promise.withResolvers<ModelCallResult<never>>(),
      }))
      provider.json.set(
        admitted.providerKey,
        attempts.map(attempt => () => {
          attempt.entered.resolve()
          return attempt.response.promise
        }),
      )
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'active',
      )
      const runtime = await startAIAgentWorkerForTest({ blockTimeout: 100, promotionInterval: 100 })
      const retries = Array.from({ length: 2 }, () => Promise.withResolvers<Job>())
      const finished = Promise.withResolvers<Job>()
      runtime.worker.on('failed', (job: Job | undefined) => {
        if (job?.id !== admitted.jobId) return
        if (job.attemptsMade < retries.length) retries[job.attemptsMade]?.resolve(job)
        else finished.resolve(job)
      })
      for (const [index, attempt] of attempts.entries()) {
        await waitForRealGlideEvent(attempt.entered.promise, `${kind} provider attempt ${index}`)
        expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
          'active',
        )
        attempt.response.reject(new Error(`Owned transient failure ${index}`))
        if (index < retries.length) {
          const retry = await waitForRealGlideEvent(
            retries[index]!.promise,
            `${kind} delayed retry ${index}`,
          )
          const state = await retry.getState()
          if (state !== 'delayed') throw new Error(`Expected delayed retry, got ${state}`)
          await retry.promote()
        }
      }
      const failed = await waitForRealGlideEvent(finished.promise, `${kind} final failure`)
      expect(provider.generateJson).toHaveBeenCalledTimes(3)
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'failed',
      )
      await failed.remove()
      expect(await runtime.queue.getJob(admitted.jobId)).toBeNull()
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'failed',
      )
      await runtime.worker.pause()
      const next = await admitted.request.post(admitted.path).send({}).expect(202)
      expect(next.body.run_id).not.toBe(admitted.runId)
      expect(
        (await admitted.request.get(`${admitted.path}/${next.body.run_id}`).expect(200)).body
          .status,
      ).toBe('active')
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'failed',
      )
    },
  )

  it.each(['report', 'appeal'] as const)(
    'publishes the actual %s result after a delayed provider success',
    async kind => {
      const provider = installAIAgentProviderFixtures()
      const admitted = await admitModerationRerunForTest(kind)
      const entered = Promise.withResolvers<void>()
      const response = Promise.withResolvers<ModelCallResult<never>>()
      provider.json.set(admitted.providerKey, [
        () => {
          entered.resolve()
          return response.promise
        },
      ])
      const runtime = await startAIAgentWorkerForTest()
      const completed = Promise.withResolvers<Job>()
      runtime.worker.on('completed', (job: Job) => {
        if (job.id === admitted.jobId) completed.resolve(job)
      })
      await waitForRealGlideEvent(entered.promise, `${kind} delayed model entry`)
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body.status).toBe(
        'active',
      )
      response.resolve(
        makeModelCallResult({
          recommended_action: kind === 'report' ? 'no_action' : 'deny',
          public_response: 'Owned completed response',
          internal_response: 'Owned private response',
        }),
      )
      const job = await waitForRealGlideEvent(completed.promise, `${kind} delayed success`)
      const saved = (await admitted.request.get(admitted.resultPath).expect(200)).body
      expect(saved.status).toBe('succeeded')
      expect(saved.run_id).toBe(admitted.runId)
      const resultMatchers = {
        report: { judgement_id: expect.any(String) },
        appeal: {
          ai_drafted_at: expect.any(String),
          latest_lifecycle_change_id: expect.any(String),
        },
      }
      expect(saved).toMatchObject(resultMatchers[kind])
      expect(saved).not.toHaveProperty('internal_response')
      expect(saved).not.toHaveProperty('ai_internal_response')
      await job.remove()
      expect((await admitted.request.get(admitted.resultPath).expect(200)).body).toEqual(saved)
    },
  )
})
