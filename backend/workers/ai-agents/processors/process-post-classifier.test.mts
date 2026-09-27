import { randomUUID } from 'node:crypto'
import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  expirePostClassifierLeaseForTest,
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import {
  claimPostClassifierApplication,
  resolvePostClassifierConfiguration,
  reservePostClassifierApplication,
} from '@services/post-classifier'
import { startPostClassifierProviderAttempt } from '@services/post-classifier/application-attempt'
import { createPostModerationContent } from '@services/posts/content'
import { AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'
import { ai_agents } from '@queues/ai-agents/queues'
import type {
  PostClassifierDispatcherJobData,
  PostClassifierJobData,
} from '@queues/ai-agents/types'
import { processReconcilePostClassifierApplications } from './process-reconcile-post-classifier-applications.mts'
import {
  processPostClassifier,
  processPostClassifierDispatcher,
} from './process-post-classifier.mts'

const detectorPackageVersion = detectorPackage.version

function dispatcherJob(postId: string): Job<PostClassifierDispatcherJobData> {
  return {
    id: randomUUID(),
    name: 'post-classifier-dispatcher',
    data: { postId },
  } as Job<PostClassifierDispatcherJobData>
}

function classifierJob(data: PostClassifierJobData): Job<PostClassifierJobData> {
  return {
    id: randomUUID(),
    name: 'post-classifier',
    data,
  } as Job<PostClassifierJobData>
}

async function createApprovedClassifierPost(remote: boolean) {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  if (remote) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  const post = await createTestPost({ user, community_id: community.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  return { community, inputSha256, post }
}

async function dispatch(postId: string): Promise<PostClassifierJobData> {
  await expect(processPostClassifierDispatcher(dispatcherJob(postId))).resolves.toEqual({
    kind: 'enqueued',
  })
  const jobs = await readAllQueueJobs(ai_agents)
  const child = jobs.find(
    job =>
      job.name === 'post-classifier' &&
      (job.data as Partial<PostClassifierJobData>).postId === postId,
  )
  if (!child) throw new Error('Expected post-classifier child job')
  return child.data as PostClassifierJobData
}

describe('post classifier worker', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined

  beforeAll(async () => {
    releaseSeedLock = await initializePostClassifierExecutionTests()
  })

  afterAll(async () => releaseSeedLock?.())

  it('dispatches one remote child from an approved post independent of label count', async () => {
    const { post } = await createApprovedClassifierPost(true)

    const child = await dispatch(post.id)

    expect(child).toMatchObject({
      postId: post.id,
      detectorPackageVersion,
    })
    expect(child.applicationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(child.inputSha256).toHaveLength(64)
    expect(child.configurationSha256).toHaveLength(64)
    expect(await getPostClassifierApplicationFacts(post.id)).toEqual([
      expect.objectContaining({
        id: child.applicationId,
        decision_batch_id: expect.any(String),
        completed_at: null,
      }),
    ])
  })

  it('runs a local-only receipt without starting a provider attempt and replays after completion', async () => {
    const { post } = await createApprovedClassifierPost(false)
    const child = await dispatch(post.id)

    await expect(processPostClassifier(classifierJob(child))).resolves.toMatchObject({
      kind: 'completed',
    })
    await expect(processPostClassifier(classifierJob(child))).resolves.toEqual({ kind: 'replay' })
    expect(await getPostClassifierApplicationFacts(post.id)).toEqual([
      expect.objectContaining({
        id: child.applicationId,
        provider_attempts_started: 0,
        completed_at: expect.any(Date),
      }),
    ])
  })

  it('skips a child whose receipt identity is stale without effects', async () => {
    const { post } = await createApprovedClassifierPost(false)
    const child = await dispatch(post.id)

    await expect(
      processPostClassifier(classifierJob({ ...child, applicationId: randomUUID() })),
    ).resolves.toEqual({ kind: 'stale' })
    expect(await getPostClassifierApplicationFacts(post.id)).toEqual([
      expect.objectContaining({
        id: child.applicationId,
        outcomes_persisted_at: null,
        completed_at: null,
      }),
    ])
  })

  it('supersedes a stale configuration receipt and dispatches the current approved fingerprint', async () => {
    const { community, post } = await createApprovedClassifierPost(true)
    const staleChild = await dispatch(post.id)
    await setPostClassifierToggleForTest(community.id, 'self-promotion', false)

    await expect(processPostClassifier(classifierJob(staleChild))).resolves.toEqual({
      kind: 'stale',
    })

    const replacements = (await readAllQueueJobs(ai_agents)).filter(
      job =>
        job.name === 'post-classifier' &&
        (job.data as Partial<PostClassifierJobData>).postId === post.id &&
        (job.data as Partial<PostClassifierJobData>).applicationId !== staleChild.applicationId,
    )
    expect(replacements).toHaveLength(1)
    const replacement = replacements[0]
    if (!replacement) throw new Error('Expected a replacement post-classifier job')
    expect(replacement.data).toMatchObject({
      postId: post.id,
      detectorPackageVersion,
    })
    expect((replacement.data as PostClassifierJobData).configurationSha256).not.toBe(
      staleChild.configurationSha256,
    )
    expect(await getPostClassifierApplicationFacts(post.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: staleChild.applicationId, superseded_at: expect.any(Date) }),
      ]),
    )
  })

  it('does not run a provider after its attempt budget is exhausted', async () => {
    const { community, inputSha256, post } = await createApprovedClassifierPost(true)
    const reservation = await reservePostClassifierApplication(post.id, detectorPackageVersion)
    if (!reservation) throw new Error('Expected classifier reservation')
    const resolved = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    if (!resolved) throw new Error('Expected classifier configuration')
    const firstClaim = await claimPostClassifierApplication({
      applicationId: reservation.applicationId,
      postId: post.id,
      inputSha256,
      resolved,
      detectorPackageVersion,
      leaseSeconds: 60,
    })
    if (firstClaim.kind !== 'claimed') throw new Error(`Unexpected first claim: ${firstClaim.kind}`)
    let claim = firstClaim
    for (let attempt = 0; attempt < AI_AGENTS_DEFAULTS.attempts; attempt++) {
      await expect(
        startPostClassifierProviderAttempt({ ...claim, maxAttempts: AI_AGENTS_DEFAULTS.attempts }),
      ).resolves.toBe('started')
      await expirePostClassifierLeaseForTest(post.id, reservation.applicationId)
      if (attempt + 1 < AI_AGENTS_DEFAULTS.attempts) {
        const reclaimed = await claimPostClassifierApplication({ ...claim, leaseSeconds: 60 })
        if (reclaimed.kind !== 'claimed') throw new Error(`Unexpected reclaim: ${reclaimed.kind}`)
        claim = reclaimed
      }
    }

    await expect(
      processPostClassifier(
        classifierJob({
          applicationId: reservation.applicationId,
          postId: post.id,
          inputSha256: inputSha256.toString('hex'),
          configurationSha256: resolved.configurationSha256.toString('hex'),
          detectorPackageVersion,
        }),
      ),
    ).resolves.toEqual({ kind: 'terminal' })
    expect(await getPostClassifierApplicationFacts(post.id)).toEqual([
      expect.objectContaining({
        id: reservation.applicationId,
        provider_attempts_started: AI_AGENTS_DEFAULTS.attempts,
        terminal_remote_failed_at: expect.any(Date),
      }),
    ])
  })

  it('reconciles an incomplete receipt but excludes an exhausted remote receipt', async () => {
    const recoverable = await createApprovedClassifierPost(false)
    const recoverableReservation = await reservePostClassifierApplication(
      recoverable.post.id,
      detectorPackageVersion,
    )
    if (!recoverableReservation) throw new Error('Expected recoverable classifier reservation')

    const terminal = await createApprovedClassifierPost(true)
    const terminalReservation = await reservePostClassifierApplication(
      terminal.post.id,
      detectorPackageVersion,
    )
    if (!terminalReservation) throw new Error('Expected terminal classifier reservation')
    const terminalResolved = await resolvePostClassifierConfiguration(terminal.community.id, {
      detectorPackageVersion,
    })
    if (!terminalResolved) throw new Error('Expected terminal classifier configuration')
    const terminalClaim = await claimPostClassifierApplication({
      applicationId: terminalReservation.applicationId,
      postId: terminal.post.id,
      inputSha256: terminal.inputSha256,
      resolved: terminalResolved,
      detectorPackageVersion,
      leaseSeconds: 60,
    })
    if (terminalClaim.kind !== 'claimed') {
      throw new Error(`Unexpected terminal claim: ${terminalClaim.kind}`)
    }
    await expect(
      startPostClassifierProviderAttempt({ ...terminalClaim, maxAttempts: 1 }),
    ).resolves.toBe('started')
    await expirePostClassifierLeaseForTest(terminal.post.id, terminalReservation.applicationId)
    const reclaimed = await claimPostClassifierApplication({ ...terminalClaim, leaseSeconds: 60 })
    if (reclaimed.kind !== 'claimed') throw new Error(`Unexpected reclaim: ${reclaimed.kind}`)
    await expect(
      startPostClassifierProviderAttempt({ ...reclaimed, maxAttempts: 1 }),
    ).resolves.toBe('terminal')

    await expect(processReconcilePostClassifierApplications()).resolves.toMatchObject({
      enqueued: expect.any(Number),
    })
    const jobs = await readAllQueueJobs(ai_agents)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'post-classifier',
          data: expect.objectContaining({ applicationId: recoverableReservation.applicationId }),
        }),
      ]),
    )
    expect(jobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'post-classifier',
          data: expect.objectContaining({ applicationId: terminalReservation.applicationId }),
        }),
      ]),
    )
  })
})
