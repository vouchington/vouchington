import {
  getClassifierRunFacts,
  getClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { supersedeClassifierRunForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { seedClassifierRunPayloadsAt } from '@voucha/test-helpers/classifier-retention'
import {
  createSyntheticFixture,
  reviseSyntheticPost,
  setSyntheticPostContent,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  claimSyntheticRun,
  leaseSyntheticRun,
  requestSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { listPendingClassifierRunRequests } from './run-discovery.mts'
import { completeClassifierRun } from './run-completion.mts'
import { claimClassifierRun } from './run-claim.mts'
import { persistClassifierRunOutcomes } from './run-outcomes.mts'
import { supersedeStaleClassifierRun } from './run-supersession.mts'

function target(run: Awaited<ReturnType<typeof reserveSyntheticRun>>) {
  return {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
  }
}

describe('classifier run supersession (real PG)', () => {
  it('refuses to reclaim a superseded promptless receipt after its 90-day payload window', async () => {
    const setup = await createSyntheticFixture()
    const { pendingId } = await seedClassifierRunPayloadsAt({
      slug: setup.slug,
      postId: setup.post.id,
      actorId: setup.actorId,
      currentInputSha256: setup.post.inputSha256,
      at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      terminalCount: 0,
    })
    await supersedeClassifierRunForTest(pendingId)
    const [before] = await getClassifierRunFacts(setup.post.id, setup.slug)

    const result = await claimClassifierRun(setup.adapter, {
      runId: pendingId,
      subject: setup.subject,
      inputSha256: setup.post.inputSha256,
      configurationSha256: before!.configuration_sha256,
      leaseSeconds: 60,
    })

    expect(result).toEqual({ kind: 'stale' })
    const [after] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(after).toMatchObject({ id: pendingId, lease_token: null })
    expect(after!.superseded_at).not.toBeNull()
  })

  it('leaves a run that still matches current content and configuration alone', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)

    expect(await supersedeStaleClassifierRun(setup.adapter, target(run))).toBeNull()

    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts!.superseded_at).toBeNull()
  })

  it('supersedes a run for revised content and reserves the replacement in one step', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const run = await reserveSyntheticRun(setup)
    const revised = await reviseSyntheticPost(setup.post.id)
    await requestSyntheticRun(setup, revised)

    const replacement = await supersedeStaleClassifierRun(setup.adapter, target(run))

    expect(replacement?.runId).not.toBe(run.runId)
    expect(replacement?.inputSha256.equals(revised)).toBe(true)
    const [old, current] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(old!.superseded_at).not.toBeNull()
    expect(current).toMatchObject({ id: replacement?.runId, superseded_at: null })
    const requests = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(requests.find(request => request.input_sha256.equals(revised))?.run_identity_id).toBe(
      replacement?.runId,
    )
  })

  it('supersedes a changed promptless configuration and reserves its own receipt', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const run = await reserveSyntheticRun(setup)
    setup.state.version = 2

    const replacement = await supersedeStaleClassifierRun(setup.adapter, target(run))

    expect(replacement?.runId).not.toBe(run.runId)
    expect(replacement?.configurationSha256.equals(run.configurationSha256)).toBe(false)
    const [old, current] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(old).toMatchObject({ id: run.runId, provider_attempts_started: 0 })
    expect(old!.superseded_at).not.toBeNull()
    expect(current).toMatchObject({ id: replacement?.runId, superseded_at: null })
    const [request] = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(request!.run_identity_id).toBe(replacement?.runId)
    expect(request!.run_settled_at).not.toBeNull()
    expect(request!.no_work_at).toBeNull()
    expect((await listPendingClassifierRunRequests(setup.adapter, null, 10)).items).toEqual([])
    expect((await claimSyntheticRun(setup, run)).kind).toBe('stale')
  })

  it('returns the request to the sweep when the subject is no longer eligible', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const run = await reserveSyntheticRun(setup)
    await setTestPostClearanceStatus(setup.post.id, 'pending')

    expect(await supersedeStaleClassifierRun(setup.adapter, target(run))).toBeNull()

    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts!.superseded_at).not.toBeNull()
    const [request] = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(request!.run_identity_id).toBeNull()
  })

  it('rejects a stale job and never produces effects for superseded content', async () => {
    const setup = await createSyntheticFixture()
    const { run, lease } = await leaseSyntheticRun(setup)
    await persistClassifierRunOutcomes(setup.adapter, { lease })
    await reviseSyntheticPost(setup.post.id)

    expect((await claimSyntheticRun(setup, run)).kind).toBe('stale')
    expect(await completeClassifierRun(setup.adapter, lease)).toEqual({ kind: 'stale' })
    expect(setup.state.applied).toEqual([])
  })

  it('revives the original receipt when content returns to it, never a second one', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)
    await reviseSyntheticPost(setup.post.id)
    await supersedeStaleClassifierRun(setup.adapter, target(run))
    await setSyntheticPostContent(setup.post.id, setup.post.inputSha256)

    const claim = await claimSyntheticRun(setup, run)

    expect(claim.kind).toBe('claimed')
    const facts = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts.find(row => row.id === run.runId)?.superseded_at).toBeNull()
    expect(facts.filter(row => row.input_sha256.equals(setup.post.inputSha256))).toHaveLength(1)
  })
})
