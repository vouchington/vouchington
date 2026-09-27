import { randomUUID } from 'node:crypto'
import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeedPostClassifierSQL from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import { createTestPost, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { holdPostClassifierActorDeletionLock } from '@voucha/test-helpers/data-stores/psql/post-classifier/actor-lock'
import { acquirePostClassifierSeedTestLock } from '@voucha/test-helpers/data-stores/psql/post-classifier/seed-lock'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import {
  expirePostClassifierLeaseForTest,
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { moderationConfig } from '@services/moderation/config'
import { claimPostClassifierApplication } from './application-claim.mts'
import {
  failPostClassifierRemoteAttempt,
  releasePostClassifierAdmissionLease,
  startPostClassifierProviderAttempt,
} from './application-attempt.mts'
import { persistPostClassifierOutcomes } from './application-outcomes.mts'
import { resolvePostClassifierConfiguration } from './configuration.mts'

const detectorPackageVersion = 'test-package-0.4.3'

async function fixture(remote = false) {
  const actor = await createTestUser()
  const community = remote ? await insertTestCommunity({ createdById: actor.id }) : null
  if (community) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  const post = await createTestPost({ user: actor, community_id: community?.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  const resolved = await resolvePostClassifierConfiguration(community?.id ?? null, {
    detectorPackageVersion,
  })
  if (!resolved) throw new Error('Baseline local configuration missing')
  return {
    post,
    communityId: community?.id ?? null,
    inputSha256,
    resolved,
    claim: () =>
      claimPostClassifierApplication({
        postId: post.id,
        inputSha256,
        resolved,
        detectorPackageVersion,
        leaseSeconds: 60,
      }),
  }
}

describe('post classifier application claim and attempt (real PG)', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = (await acquirePostClassifierSeedTestLock()).release
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeedPostClassifierSQL(), undefined)
  })
  afterAll(async () => releaseSeedLock?.())

  it('serializes concurrent duplicate claims to one identity and one live lease', async () => {
    const setup = await fixture()
    const [left, right] = await Promise.all([setup.claim(), setup.claim()])
    expect([left.kind, right.kind].sort()).toEqual(['claimed', 'in_progress'])
    const claimed = left.kind === 'claimed' ? left : right
    if (claimed.kind !== 'claimed') throw new Error('Expected one claimant')
    const facts = await getPostClassifierApplicationFacts(setup.post.id)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ id: claimed.applicationId, reserved_batch_id: null })
  })

  it('waits for actor deletion before taking its actor row share lock', async () => {
    const setup = await fixture()
    const holder = await holdPostClassifierActorDeletionLock(setup.resolved.configuration.actorId)
    const claiming = setup.claim()
    try {
      await waitForTestPostgresLockWaiter(holder.processId, 'lockPostClassifierApplicationActor')
      await expect(holder.lockActorRow()).resolves.toBeUndefined()
    } finally {
      await holder.release()
    }
    await expect(claiming).resolves.toMatchObject({ kind: 'claimed' })
  })

  it('rejects stale lease tokens after reclaim and preserves the stable receipt ID', async () => {
    const setup = await fixture()
    const first = await setup.claim()
    if (first.kind !== 'claimed') throw new Error('Expected first claim')
    await expirePostClassifierLeaseForTest(setup.post.id, first.applicationId)
    const second = await setup.claim()
    expect(second).toMatchObject({ kind: 'claimed', applicationId: first.applicationId })
    if (second.kind !== 'claimed') throw new Error('Expected reclaimed lease')
    expect(second.leaseToken).not.toBe(first.leaseToken)
    await expect(startPostClassifierProviderAttempt({ ...first, maxAttempts: 3 })).resolves.toBe(
      'stale',
    )
  })

  it('releases an admission lease without consuming attempts and fences a successor lease', async () => {
    const setup = await fixture(true)
    const first = await setup.claim()
    if (first.kind !== 'claimed') throw new Error('Expected first claim')
    await expect(releasePostClassifierAdmissionLease(first)).resolves.toBe('released')
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { provider_attempts_started: 0, terminal_remote_failed_at: null },
    ])
    const successor = await setup.claim()
    if (successor.kind !== 'claimed') throw new Error('Expected immediate successor claim')
    await expect(releasePostClassifierAdmissionLease(first)).resolves.toBe('stale')
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { lease_token: successor.leaseToken },
    ])
  })

  it('does not release a receipt after outcomes persist', async () => {
    const setup = await fixture()
    const claim = await setup.claim()
    if (claim.kind !== 'claimed') throw new Error('Expected local claim')
    const local = claim.resolved.configuration.local
    if (!local) throw new Error('Expected local configuration')
    await expect(
      persistPostClassifierOutcomes({
        lease: claim,
        localOutcome: {
          flagged: false,
          reason: 'Human-authored',
          confidenceScore: 0.01,
          confidenceThreshold: local.confidenceThreshold,
          classification: 'human',
          detector: 'test-detector',
          detectorModelVersion: 'test-model',
        },
      }),
    ).resolves.toBe('persisted')
    await expect(releasePostClassifierAdmissionLease(claim)).resolves.toBe('stale')
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { lease_token: claim.leaseToken, outcomes_persisted_at: expect.any(Date) },
    ])
  })

  it('preserves an already-recorded provider attempt when releasing the lease', async () => {
    const setup = await fixture(true)
    const claim = await setup.claim()
    if (claim.kind !== 'claimed') throw new Error('Expected remote claim')
    await expect(startPostClassifierProviderAttempt({ ...claim, maxAttempts: 3 })).resolves.toBe(
      'started',
    )
    await expect(
      failPostClassifierRemoteAttempt({
        ...claim,
        maxAttempts: 3,
        failureKind: 'provider-error',
      }),
    ).resolves.toBe('released')
    const reclaimed = await setup.claim()
    if (reclaimed.kind !== 'claimed') throw new Error('Expected reclaimed lease')
    await expect(releasePostClassifierAdmissionLease(reclaimed)).resolves.toBe('released')
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { provider_attempts_started: 1 },
    ])
  })

  it('keeps the physical provider attempt cap across lease reclaims and re-enqueues', async () => {
    const setup = await fixture(true)
    let current = await setup.claim()
    if (current.kind !== 'claimed') throw new Error('Expected initial claim')
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(await startPostClassifierProviderAttempt({ ...current, maxAttempts: 3 })).toBe(
        'started',
      )
      await expirePostClassifierLeaseForTest(setup.post.id, current.applicationId)
      const reclaimed = await setup.claim()
      if (reclaimed.kind !== 'claimed') throw new Error('Expected re-enqueued reclaimed claim')
      expect(reclaimed.applicationId).toBe(current.applicationId)
      current = reclaimed
    }
    expect(await startPostClassifierProviderAttempt({ ...current, maxAttempts: 3 })).toBe(
      'terminal',
    )
    expect(await setup.claim()).toEqual({ kind: 'terminal' })
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { provider_attempts_started: 3 },
    ])
  })

  it('releases below-cap remote failures, rejects stale failure leases, and terminalizes at cap', async () => {
    const setup = await fixture(true)
    const first = await setup.claim()
    if (first.kind !== 'claimed') throw new Error('Expected initial remote claim')
    expect(await startPostClassifierProviderAttempt({ ...first, maxAttempts: 2 })).toBe('started')
    expect(
      await failPostClassifierRemoteAttempt({
        ...first,
        maxAttempts: 2,
        failureKind: 'provider-error',
      }),
    ).toBe('released')
    const reclaimed = await setup.claim()
    if (reclaimed.kind !== 'claimed') throw new Error('Expected reclaimed remote claim')
    expect(
      await failPostClassifierRemoteAttempt({
        ...first,
        maxAttempts: 2,
        failureKind: 'provider-error',
      }),
    ).toBe('stale')
    expect(await startPostClassifierProviderAttempt({ ...reclaimed, maxAttempts: 2 })).toBe(
      'started',
    )
    expect(
      await failPostClassifierRemoteAttempt({
        ...reclaimed,
        maxAttempts: 2,
        failureKind: 'provider-error',
      }),
    ).toBe('terminal')
    expect(await setup.claim()).toEqual({ kind: 'terminal' })
  })

  it('blocks changed post content and configuration before creating a receipt', async () => {
    const setup = await fixture()
    await setPostClassifierPostHashForTest(setup.post.id, Buffer.alloc(32, 7))
    await expect(setup.claim()).resolves.toMatchObject({ kind: 'stale' })
    await setPostClassifierPostHashForTest(setup.post.id, setup.inputSha256)
    await expect(
      claimPostClassifierApplication({
        postId: setup.post.id,
        inputSha256: setup.inputSha256,
        resolved: setup.resolved,
        detectorPackageVersion: `${detectorPackageVersion}-${randomUUID()}`,
        leaseSeconds: 60,
      }),
    ).resolves.toMatchObject({ kind: 'stale' })
  })

  it('treats a first-time AI toggle row inserted after claim as a stale mutation boundary', async () => {
    const setup = await fixture(true)
    const claimed = await setup.claim()
    if (claimed.kind !== 'claimed') throw new Error('Expected classifier claim')
    if (!setup.communityId) throw new Error('Expected classifier community')
    await setPostClassifierToggleForTest(setup.communityId, 'ai-generated', false)
    expect(
      await persistPostClassifierOutcomes({
        lease: claimed,
        localOutcome: {
          flagged: true,
          reason: 'AI-generated',
          confidenceScore: 0.98,
          confidenceThreshold: 0.95,
          classification: 'ai',
          detector: 'test-detector',
          detectorModelVersion: 'test-model',
        },
      }),
    ).toBe('stale')
    expect((await getPostClassifierApplicationFacts(setup.post.id))[0]).toMatchObject({
      outcomes_persisted_at: null,
    })
  })
})
