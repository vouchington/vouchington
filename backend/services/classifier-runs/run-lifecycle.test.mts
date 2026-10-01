import { holdClassifierRunActorDeletionLock } from '@voucha/test-helpers/data-stores/psql/classifier-runs/actor-lock'
import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
  markClassifierRunTerminalForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  claimSyntheticRun,
  leaseSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import { describe, expect, it } from 'vitest'
import {
  failClassifierClientUnavailable,
  releaseClassifierRunLease,
  startClassifierProviderAttempt,
} from './run-attempt.mts'
import { completeClassifierRun } from './run-completion.mts'
import { persistClassifierRunOutcomes } from './run-outcomes.mts'
import { readClassifierRunOutcomes } from './run-read.mts'

describe('classifier run claim and completion (real PG)', () => {
  it('serializes concurrent claims to one live lease on one receipt', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)

    const [left, right] = await Promise.all([
      claimSyntheticRun(setup, run),
      claimSyntheticRun(setup, run),
    ])

    expect([left.kind, right.kind].toSorted()).toEqual(['claimed', 'in_progress'])
    const busy = left.kind === 'in_progress' ? left : right
    expect(busy.kind === 'in_progress' && busy.retryAfterSeconds).toBeGreaterThan(0)
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toHaveLength(1)
  })

  it('waits for actor deletion before taking its actor row share lock', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)
    const holder = await holdClassifierRunActorDeletionLock(setup.actorId)
    const claiming = claimSyntheticRun(setup, run)
    try {
      await waitForTestPostgresLockWaiter(holder.processId, 'lockClassifierRunActor')
      await expect(holder.lockActorRow()).resolves.toBeUndefined()
    } finally {
      await holder.release()
    }
    expect((await claiming).kind).toBe('claimed')
  })

  it('reclaims the same receipt after lease expiry and fences out the old lease', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease: stale } = await leaseSyntheticRun(setup)
    await expireClassifierRunLeaseForTest(run.runId)

    const reclaimed = await claimSyntheticRun(setup, run)
    if (reclaimed.kind !== 'claimed') throw new Error(`Unexpected claim: ${reclaimed.kind}`)

    expect(reclaimed.lease.runId).toBe(run.runId)
    expect(reclaimed.lease.leaseToken).not.toBe(stale.leaseToken)
    expect(await persistClassifierRunOutcomes(setup.adapter, { lease: stale })).toBe('stale')
    expect(await completeClassifierRun(setup.adapter, stale)).toEqual({ kind: 'stale' })
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toHaveLength(1)
  })

  it('persists outcomes once, applies effects once, then replays', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease } = await leaseSyntheticRun(setup)

    expect(await persistClassifierRunOutcomes(setup.adapter, { lease })).toBe('persisted')
    expect(await persistClassifierRunOutcomes(setup.adapter, { lease })).toBe('replay')
    expect(await readClassifierRunOutcomes(setup.adapter, lease)).toEqual({
      local: null,
      remoteDecision: null,
    })
    expect(await completeClassifierRun(setup.adapter, lease)).toEqual({
      kind: 'completed',
      effects: { runId: run.runId },
    })
    expect(await completeClassifierRun(setup.adapter, lease)).toEqual({ kind: 'replay' })

    expect(setup.state.applied).toEqual([run.runId])
    const claim = await claimSyntheticRun(setup, run)
    expect(claim.kind).toBe('completed')
    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts!.completed_at).not.toBeNull()
    expect(facts!.lease_token).toBeNull()
  })

  it('rolls the completion marker back with a failed effect and finishes on retry', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease } = await leaseSyntheticRun(setup)
    await persistClassifierRunOutcomes(setup.adapter, { lease })
    setup.state.failEffects = true

    await expect(completeClassifierRun(setup.adapter, lease)).rejects.toThrow(
      'synthetic effect failed',
    )

    const [failed] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(failed!.completed_at).toBeNull()
    setup.state.failEffects = false
    await expireClassifierRunLeaseForTest(run.runId)
    const retry = await claimSyntheticRun(setup, run)
    if (retry.kind !== 'outcomes_ready') throw new Error(`Unexpected claim: ${retry.kind}`)
    expect(await completeClassifierRun(setup.adapter, retry.lease)).toMatchObject({
      kind: 'completed',
    })
    expect(setup.state.applied).toEqual([run.runId])
  })

  it('requires durable outcomes before completion', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)

    await expect(completeClassifierRun(setup.adapter, lease)).rejects.toThrow(
      'outcomes must persist before completion',
    )
    expect(setup.state.applied).toEqual([])
  })

  it('releases a lease so the next claim succeeds without waiting for expiry', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease } = await leaseSyntheticRun(setup)

    expect(await releaseClassifierRunLease(setup.adapter, lease)).toBe('released')
    expect(await releaseClassifierRunLease(setup.adapter, lease)).toBe('stale')

    expect((await claimSyntheticRun(setup, run)).kind).toBe('claimed')
  })

  it('reports a terminal receipt without leasing it', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease } = await leaseSyntheticRun(setup)
    await markClassifierRunTerminalForTest(run.runId, 'provider-error')

    expect((await claimSyntheticRun(setup, run)).kind).toBe('terminal')
    expect(await persistClassifierRunOutcomes(setup.adapter, { lease })).toBe('stale')
  })

  it('never reserves a provider attempt for a local-only run', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)

    expect(await startClassifierProviderAttempt(setup.adapter, { lease, maxAttempts: 3 })).toBe(
      'no_remote',
    )
    await expect(failClassifierClientUnavailable(setup.adapter, { lease })).rejects.toThrow(
      'no remote client to lose',
    )
    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts).toMatchObject({ provider_attempts_started: 0, terminal_failure_kind: null })
  })

  it('rejects remote output and a non-positive attempt cap on a local-only run', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)

    await expect(
      startClassifierProviderAttempt(setup.adapter, { lease, maxAttempts: 0 }),
    ).rejects.toThrow('attempt limit must be positive')
    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease,
        local: { unexpected: true } as never,
      }),
    ).rejects.toThrow('does not accept a local outcome')
  })
})
