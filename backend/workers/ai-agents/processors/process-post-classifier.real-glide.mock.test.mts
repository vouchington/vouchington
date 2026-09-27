import { randomUUID } from 'node:crypto'
import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'
import { enqueuePostClassifier } from '@queues/ai-agents/enqueues/post-classifier'
import { ai_agents } from '@queues/ai-agents/queues'
import { notifications } from '@queues/notifications/queues'
import type { PostClassifierJobData } from '@queues/ai-agents/types'
import { reservePostClassifierApplication } from '@services/post-classifier'
import { openAiSpendCapConfig } from '@services/ai-usage'
import { createPostModerationContent } from '@services/posts/content'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { processPostClassifier } from './process-post-classifier.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

describe('post classifier processor (real GlideMQ)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => {
    await release?.()
    vi.unstubAllEnvs()
  })

  it('releases an exhausted queue identity and executes all remote topics exactly once on recovery', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    await openAiSpendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    for (const slug of [
      'self-promotion',
      'marketplace',
      'politics-averse',
      'click-bait',
      'vague-post',
      'shit-post',
    ] as const) {
      await setPostClassifierToggleForTest(community.id, slug, true)
    }
    await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
    const post = await createTestPost({ user, community_id: community.id })
    await setPostClassifierPostHashForTest(
      post.id,
      createPostModerationContent(post).content_sha256,
    )
    const reservation = await reservePostClassifierApplication(post.id, detectorPackage.version)
    if (!reservation) throw new Error('Expected reservation')
    const data: PostClassifierJobData = {
      ...reservation,
      inputSha256: reservation.inputSha256.toString('hex'),
      configurationSha256: reservation.configurationSha256.toString('hex'),
    }
    const request = vi.mocked(fetchStructuredDecisionProvider)
    request.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> }
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
    const worker = createWorker<PostClassifierJobData>(AI_AGENTS_QUEUE_NAME, async job => {
      if (job.data.applicationId !== data.applicationId) throw new Error('Unexpected test job')
      targetHandlerInvocations++
      if (unavailable) {
        attempts++
        throw new Error('Worker unavailable before provider execution')
      }
      try {
        return await processPostClassifier(job)
      } catch (error) {
        executionErrors.push(error)
        throw error
      }
    })
    try {
      await enqueuePostClassifier(data)
      await enqueuePostClassifier(data)
      await expect.poll(() => attempts, { timeout: 15_000 }).toBe(AI_AGENTS_DEFAULTS.attempts)
      const jobId = `post_classifier_${data.applicationId}`
      await expect.poll(() => ai_agents.getJob(jobId), { timeout: 5_000 }).toBeNull()
      expect(request).not.toHaveBeenCalled()
      unavailable = false
      await enqueuePostClassifier(data)
      await expect
        .poll(
          async () => ({
            completed: Boolean((await getPostClassifierApplicationFacts(post.id))[0]?.completed_at),
            errors: executionErrors,
          }),
          {
            timeout: 15_000,
          },
        )
        .toEqual({ completed: true, errors: [] })
      await expect.poll(() => targetHandlerInvocations, { timeout: 5_000 }).toBe(attempts + 1)
      expect(request).toHaveBeenCalledOnce()
      await expect.poll(() => ai_agents.getJob(jobId), { timeout: 5_000 }).toBeNull()
      await enqueuePostClassifier(data)
      await expect.poll(() => targetHandlerInvocations, { timeout: 15_000 }).toBe(attempts + 2)
      await expect.poll(() => ai_agents.getJob(jobId), { timeout: 15_000 }).toBeNull()
      expect(request).toHaveBeenCalledOnce()
      expect((await getPostClassifierApplicationFacts(post.id))[0]?.provider_attempts_started).toBe(
        1,
      )
    } finally {
      await closeAndUnregisterGlideMQInstance(worker)
      await Promise.all(
        (await readAllQueueJobs(ai_agents))
          .filter(
            job =>
              job.name === 'post-classifier' &&
              (job.data as Partial<PostClassifierJobData>).applicationId === data.applicationId,
          )
          .map(job => job.remove()),
      )
      await Promise.all(
        (await readAllQueueJobs(notifications))
          .filter(
            job =>
              job.name === 'processReconcilePostNotifications' &&
              (job.data as { postId?: string }).postId === post.id,
          )
          .map(job => job.remove()),
      )
      restore()
    }
  })
})
