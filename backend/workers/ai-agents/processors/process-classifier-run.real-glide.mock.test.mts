import { randomUUID } from 'node:crypto'
import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import { Response } from 'undici'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import type { Worker } from 'glide-mq'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import {
  AI_AGENTS_QUEUE_NAME,
  CLASSIFIER_RUN_ATTEMPTS,
  CLASSIFIER_RUN_BACKOFF,
} from '@queues/ai-agents/config'
import { classifierRunJobId, enqueueClassifierRun } from '@queues/ai-agents/enqueues/classifier-run'
import { ai_agents } from '@queues/ai-agents/queues'
import { notifications } from '@queues/notifications/queues'
import type { ClassifierRunJobData } from '@queues/ai-agents/types'
import { claimClassifierRun, startClassifierProviderAttempt } from '@services/classifier-runs'
import { createPostClassifierRunAdapter } from '@services/post-classifier'
import { spendCapConfig } from '@services/ai-usage'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  classifierRunJobFor,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { toClassifierRunJobData } from './classifier-run-handler.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processClassifierRun } from './process-classifier-run.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const REMOTE_TOPICS = [
  'marketplace',
  'politics-averse',
  'click-bait',
  'vague-post',
  'shit-post',
] as const

/** Reserves the run the dispatcher would, without queueing it, so this test owns the queue. */
async function reserveRun(remote: boolean, local: boolean) {
  const setup = await createApprovedClassifierPost(remote, local)
  const subject = { postId: setup.post.id, rssFeedItemId: null }
  const reserved = await getClassifierRunHandler(POST_CLASSIFIER_SLUG).reserve(subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  return { ...setup, subject, run: reserved.run }
}

describe('classifier run processor (real GlideMQ)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })
  afterAll(async () => {
    await release?.()
    vi.unstubAllEnvs()
  })

  it('does not reach the provider after the durable attempt budget is exhausted, and keeps the local outcome', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    const request = vi.mocked(fetchStructuredDecisionProvider)
    request.mockRejectedValue(new Error('Unexpected provider request'))
    const { post, inputSha256, subject, run } = await reserveRun(true, true)
    const adapter = createPostClassifierRunAdapter(detectorPackage.version)
    const target = {
      runId: run.runId,
      subject,
      inputSha256,
      configurationSha256: run.configurationSha256,
      leaseSeconds: 60,
    }
    for (let attempt = 0; attempt < CLASSIFIER_RUN_ATTEMPTS; attempt++) {
      const claim = await claimClassifierRun(adapter, target)
      if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
      await expect(
        startClassifierProviderAttempt(adapter, {
          lease: claim.lease,
          maxAttempts: CLASSIFIER_RUN_ATTEMPTS,
        }),
      ).resolves.toBe('started')
      await expireClassifierRunLeaseForTest(run.runId)
    }

    await expect(
      processClassifierRun(classifierRunJobFor(toClassifierRunJobData(POST_CLASSIFIER_SLUG, run))),
    ).resolves.toEqual({ kind: 'terminal' })

    expect(request).not.toHaveBeenCalled()
    await expect(getClassifierRunFacts(post.id, POST_CLASSIFIER_SLUG)).resolves.toMatchObject([
      {
        provider_attempts_started: CLASSIFIER_RUN_ATTEMPTS,
        terminal_failure_kind: 'attempts-exhausted',
        terminal_failed_at: expect.any(Date),
      },
    ])
    await expect(getPostClassifierLocalOutcomeFacts(run.runId)).resolves.toMatchObject({
      is_flagged: expect.any(Boolean),
    })
  })

  it('releases an exhausted queue identity and executes all remote topics exactly once on recovery', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    await spendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const setup = await createApprovedClassifierPost(true, false)
    for (const slug of REMOTE_TOPICS) {
      await setPostClassifierToggleForTest(setup.community.id, slug, true)
    }
    const reserved = await getClassifierRunHandler(POST_CLASSIFIER_SLUG).reserve({
      postId: setup.post.id,
      rssFeedItemId: null,
    })
    if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
    const data = toClassifierRunJobData(POST_CLASSIFIER_SLUG, reserved.run)
    const request = vi.mocked(fetchStructuredDecisionProvider)
    request.mockImplementation(async (_url, init) => {
      const body = JSON.parse(stringFromUnknown(init?.body)) as {
        questions: Record<string, unknown>
      }
      expect(Object.keys(body.questions)).toHaveLength(10)
      return Response.json({
        id: `decision-${randomUUID()}`,
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
        answers: Object.keys(body.questions).map(id => ({ id, type: 'noul', noul: 0.9 })),
      })
    })
    let unavailable = true
    let attempts = 0
    let targetHandlerInvocations = 0
    const executionErrors: unknown[] = []
    const worker = createWorker<ClassifierRunJobData>(
      AI_AGENTS_QUEUE_NAME,
      async job => {
        if (job.data.runId !== data.runId) throw new Error('Unexpected test job')
        targetHandlerInvocations++
        if (unavailable) {
          attempts++
          throw new Error('Worker unavailable before provider execution')
        }
        try {
          return await processClassifierRun(job)
        } catch (err) {
          executionErrors.push(err)
          throw err
        }
      },
      // The production outage backoff is minutes long; this test only needs the attempts to run out.
      // A promoted retry is otherwise picked up on the scheduler's and worker's 5 second ticks.
      {
        promotionInterval: 100,
        blockTimeout: 100,
        backoffStrategies: { [CLASSIFIER_RUN_BACKOFF.type]: () => 50 },
      },
    )
    const jobId = classifierRunJobId(data.runId)
    const facts = async () => (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]
    const exhausted = waitForWorkerJob(worker, 'failed', jobId, CLASSIFIER_RUN_ATTEMPTS)
    try {
      await enqueueClassifierRun(data)
      await enqueueClassifierRun(data)
      await exhausted
      expect(attempts).toBe(CLASSIFIER_RUN_ATTEMPTS)
      expect(await ai_agents.getJob(jobId)).toBeNull()
      expect(request).not.toHaveBeenCalled()
      unavailable = false
      const recovered = waitForWorkerJob(worker, 'completed', jobId)
      await enqueueClassifierRun(data)
      await recovered
      expect(executionErrors).toEqual([])
      expect((await facts())?.completed_at).toEqual(expect.any(Date))
      expect(targetHandlerInvocations).toBe(attempts + 1)
      expect(request).toHaveBeenCalledOnce()
      expect(await ai_agents.getJob(jobId)).toBeNull()
      const replayed = waitForWorkerJob(worker, 'completed', jobId)
      await enqueueClassifierRun(data)
      await replayed
      expect(targetHandlerInvocations).toBe(attempts + 2)
      expect(await ai_agents.getJob(jobId)).toBeNull()
      expect(request).toHaveBeenCalledOnce()
      expect((await facts())?.provider_attempts_started).toBe(1)
    } finally {
      await closeAndUnregisterGlideMQInstance(worker)
      await Promise.all(
        (await readAllQueueJobs(ai_agents))
          .filter(
            job =>
              job.name === 'classifier-run' &&
              (job.data as Partial<ClassifierRunJobData>).runId === data.runId,
          )
          .map(job => job.remove()),
      )
      await Promise.all(
        (await readAllQueueJobs(notifications))
          .filter(
            job =>
              job.name === 'processReconcilePostNotifications' &&
              (job.data as { postId?: string }).postId === setup.post.id,
          )
          .map(job => job.remove()),
      )
      restore()
    }
  })
})

function waitForWorkerJob(
  worker: Worker<ClassifierRunJobData>,
  event: 'completed' | 'failed',
  jobId: string,
  times = 1,
): Promise<void> {
  let seen = 0
  return new Promise(resolve => {
    const onEvent = (job?: { id: string }) => {
      if (job?.id !== jobId) return
      seen += 1
      if (seen < times) return
      worker.off(event, onEvent)
      resolve()
    }
    worker.on(event, onEvent)
  })
}
