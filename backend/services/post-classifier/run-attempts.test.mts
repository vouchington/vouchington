import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
  type PostClassifierExecutionFixture,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  localOutcomeFor,
  remoteDecisionFor,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  claimClassifierRun,
  failClassifierClientUnavailable,
  failClassifierRunAttempt,
  persistClassifierRunOutcomes,
  releaseClassifierRunLease,
  startClassifierProviderAttempt,
} from '@services/classifier-runs'

const facts = async (setup: PostClassifierExecutionFixture) =>
  (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]!

function reclaim(setup: PostClassifierExecutionFixture) {
  return claimClassifierRun(setup.adapter, {
    runId: setup.run.runId,
    subject: setup.run.subject,
    inputSha256: setup.run.inputSha256,
    configurationSha256: setup.run.configurationSha256,
    leaseSeconds: 60,
  })
}

async function expireAndReclaim(setup: PostClassifierExecutionFixture) {
  await expireClassifierRunLeaseForTest(setup.run.runId)
  const claim = await reclaim(setup)
  if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
  return claim.lease
}

describe('post classifier provider attempts on the shared lifecycle (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('keeps the physical attempt cap across lease reclaims and retains the local outcome', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    let lease = setup.lease
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(await startClassifierProviderAttempt(setup.adapter, { lease, maxAttempts: 3 })).toBe(
        'started',
      )
      lease = await expireAndReclaim(setup)
      expect(lease.runId).toBe(setup.run.runId)
    }

    expect(
      await startClassifierProviderAttempt(setup.adapter, {
        lease,
        maxAttempts: 3,
        local: localOutcomeFor(setup, true),
      }),
    ).toBe('terminal')

    expect(await reclaim(setup)).toEqual({ kind: 'terminal' })
    expect(await facts(setup)).toMatchObject({
      provider_attempts_started: 3,
      terminal_failure_kind: 'attempts-exhausted',
    })
    expect(await getPostClassifierLocalOutcomeFacts(setup.run.runId)).toMatchObject({
      flagged: true,
    })
  })

  it('requires the configured local outcome to be supplied when the cap ends the run', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 1 })
    const lease = await expireAndReclaim(setup)

    await expect(
      startClassifierProviderAttempt(setup.adapter, { lease, maxAttempts: 1 }),
    ).rejects.toThrow('local outcome is required')
    expect(await facts(setup)).toMatchObject({ terminal_failure_kind: null })
  })

  it('releases below-cap failures, fences the old lease, and ends at the cap', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const first = setup.lease
    expect(
      await startClassifierProviderAttempt(setup.adapter, { lease: first, maxAttempts: 2 }),
    ).toBe('started')
    expect(
      await failClassifierRunAttempt(setup.adapter, {
        lease: first,
        maxAttempts: 2,
        failureKind: 'provider-error',
      }),
    ).toBe('released')

    const second = await reclaim(setup)
    if (second.kind !== 'claimed') throw new Error('Expected reclaimed lease')
    expect(
      await failClassifierRunAttempt(setup.adapter, {
        lease: first,
        maxAttempts: 2,
        failureKind: 'provider-error',
      }),
    ).toBe('stale')
    expect(
      await startClassifierProviderAttempt(setup.adapter, { lease: second.lease, maxAttempts: 2 }),
    ).toBe('started')
    expect(
      await failClassifierRunAttempt(setup.adapter, {
        lease: second.lease,
        maxAttempts: 2,
        failureKind: 'invalid-result',
      }),
    ).toBe('terminal')

    expect(await reclaim(setup)).toEqual({ kind: 'terminal' })
    expect(await facts(setup)).toMatchObject({
      provider_attempts_started: 2,
      terminal_failure_kind: 'invalid-result',
    })
  })

  it('ends the run at once on a permanent rejection and keeps the local outcome', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 })

    expect(
      await failClassifierRunAttempt(setup.adapter, {
        lease: setup.lease,
        maxAttempts: 3,
        failureKind: 'context-rejected',
        local: localOutcomeFor(setup, false),
      }),
    ).toBe('terminal')

    expect(await facts(setup)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'context-rejected',
    })
    expect(await getPostClassifierLocalOutcomeFacts(setup.run.runId)).toMatchObject({
      flagged: false,
    })
  })

  it('records client-unavailable without a provider attempt and keeps the local outcome', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)

    expect(
      await failClassifierClientUnavailable(setup.adapter, {
        lease: setup.lease,
        local: localOutcomeFor(setup, true),
      }),
    ).toBe('terminal')

    expect(await facts(setup)).toMatchObject({
      provider_attempts_started: 0,
      terminal_failure_kind: 'client-unavailable',
      outcomes_persisted_at: null,
    })
    expect(await getPostClassifierLocalOutcomeFacts(setup.run.runId)).toMatchObject({
      flagged: true,
    })
    expect(await reclaim(setup)).toEqual({ kind: 'terminal' })
  })

  it('leaves a run with durable outcomes alone when the client turns out unavailable', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 })
    await persistClassifierRunOutcomes(setup.adapter, {
      lease: setup.lease,
      remoteDecision: remoteDecisionFor(setup, true),
    })

    expect(await failClassifierClientUnavailable(setup.adapter, { lease: setup.lease })).toBe(
      'stale',
    )
    expect(await facts(setup)).toMatchObject({ terminal_failure_kind: null })
  })

  it('never bills a second attempt for a replay after outcomes are durable', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 })
    await persistClassifierRunOutcomes(setup.adapter, {
      lease: setup.lease,
      remoteDecision: remoteDecisionFor(setup, true),
    })

    expect(
      await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 }),
    ).toBe('replay')
    expect(
      await failClassifierRunAttempt(setup.adapter, {
        lease: setup.lease,
        maxAttempts: 3,
        failureKind: 'provider-error',
      }),
    ).toBe('stale')
    expect(await releaseClassifierRunLease(setup.adapter, setup.lease)).toBe('stale')
    expect(await facts(setup)).toMatchObject({ provider_attempts_started: 1 })
  })

  it('releases an admission lease without consuming an attempt', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)

    expect(await releaseClassifierRunLease(setup.adapter, setup.lease)).toBe('released')

    expect(await facts(setup)).toMatchObject({
      provider_attempts_started: 0,
      terminal_failure_kind: null,
      lease_token: null,
    })
    expect((await reclaim(setup)).kind).toBe('claimed')
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid attempt limit %s', async maxAttempts => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await expect(
      startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts }),
    ).rejects.toThrow('attempt limit must be positive')
    await expect(
      failClassifierRunAttempt(setup.adapter, {
        lease: setup.lease,
        maxAttempts,
        failureKind: 'provider-error',
      }),
    ).rejects.toThrow('attempt limit must be positive')
    expect(await facts(setup)).toMatchObject({ provider_attempts_started: 0 })
  })
})
