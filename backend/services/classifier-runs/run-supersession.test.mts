import {
  getClassifierRunFacts,
  getClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
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
import { completeClassifierRun } from './run-completion.mts'
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
    expect(requests.find(request => request.input_sha256.equals(revised))?.run_id).toBe(
      replacement?.runId,
    )
  })

  it('supersedes a run for changed configuration with a new receipt identity', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)
    setup.state.version = 2

    const replacement = await supersedeStaleClassifierRun(setup.adapter, target(run))

    expect(replacement).not.toBeNull()
    expect(replacement!.configurationSha256.equals(run.configurationSha256)).toBe(false)
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toHaveLength(2)
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
    expect(request!.run_id).toBeNull()
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
