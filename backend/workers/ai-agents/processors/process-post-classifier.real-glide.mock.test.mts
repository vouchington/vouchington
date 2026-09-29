import { randomUUID } from 'node:crypto'
import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import { Response } from 'undici'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'
import { enqueuePostClassifier } from '@queues/ai-agents/enqueues/post-classifier'
import { ai_agents } from '@queues/ai-agents/queues'
import { notifications } from '@queues/notifications/queues'
import type { PostClassifierJobData } from '@queues/ai-agents/types'
import {
  claimPostClassifierApplication,
  reservePostClassifierApplication,
  resolvePostClassifierConfiguration,
} from '@services/post-classifier'
import { startPostClassifierProviderAttempt } from '@services/post-classifier/application-attempt'
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
  expirePostClassifierLeaseForTest,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { processPostClassifier } from './process-post-classifier.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

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
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })
  afterAll(async () => {
    await release?.()
    vi.unstubAllEnvs()
  })

  it('does not reach the provider transport after the durable attempt budget is exhausted', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    const request = vi.mocked(fetchStructuredDecisionProvider)
    request.mockRejectedValue(new Error('Unexpected provider request'))
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
    await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
    const post = await createTestPost({ user, community_id: community.id })
    const inputSha256 = createPostModerationContent(post).content_sha256
    await setPostClassifierPostHashForTest(post.id, inputSha256)
    const detectorPackageVersion = detectorPackage.version
    const resolved = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    if (!resolved) throw new Error('Expected remote configuration')
    const first = await claimPostClassifierApplication({
      postId: post.id,
      inputSha256,
      resolved,
      detectorPackageVersion,
      leaseSeconds: 60,
    })
    if (first.kind !== 'claimed') throw new Error('Expected first claim')
    let claim = first
    for (let attempt = 0; attempt < AI_AGENTS_DEFAULTS.attempts; attempt++) {
      await expect(
        startPostClassifierProviderAttempt({ ...claim, maxAttempts: AI_AGENTS_DEFAULTS.attempts }),
      ).resolves.toBe('started')
      await expirePostClassifierLeaseForTest(post.id, claim.applicationId)
      if (attempt + 1 < AI_AGENTS_DEFAULTS.attempts) {
        const reclaimed = await claimPostClassifierApplication({ ...claim, leaseSeconds: 60 })
        if (reclaimed.kind !== 'claimed') throw new Error('Expected reclaimed lease')
        claim = reclaimed
      }
    }
    const data: PostClassifierJobData = {
      applicationId: first.applicationId,
      postId: post.id,
      inputSha256: inputSha256.toString('hex'),
      configurationSha256: resolved.configurationSha256.toString('hex'),
      detectorPackageVersion,
    }
    await expect(
      processPostClassifier({
        id: randomUUID(),
        name: 'post-classifier',
        data,
      } as Job<PostClassifierJobData>),
    ).resolves.toEqual({ kind: 'terminal' })
    expect(request).not.toHaveBeenCalled()
    await expect(getPostClassifierApplicationFacts(post.id)).resolves.toMatchObject([
      {
        provider_attempts_started: AI_AGENTS_DEFAULTS.attempts,
        terminal_remote_failed_at: expect.any(Date),
      },
    ])
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
