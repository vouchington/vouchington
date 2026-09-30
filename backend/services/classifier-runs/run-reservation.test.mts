import {
  getClassifierRunFacts,
  getClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createSyntheticFixture,
  reviseSyntheticPost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  requestSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { listPendingClassifierRunRequests } from './run-discovery.mts'
import { reserveClassifierRun } from './run-reservation.mts'

describe('classifier run reservation and requests (real PG)', () => {
  it('persists one receipt snapshot before any job runs and settles the request', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const run = await reserveSyntheticRun(setup)

    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts).toMatchObject({
      id: run.runId,
      decision_batch_id: null,
      provider_attempts_started: 0,
      completed_at: null,
    })
    expect(facts!.input_sha256.equals(setup.post.inputSha256)).toBe(true)
    const [request] = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(request).toMatchObject({ run_id: run.runId, no_work_at: null, stale_at: null })
  })

  it('creates one receipt when reservations race, and none for a repeat', async () => {
    const setup = await createSyntheticFixture()
    const [left, right] = await Promise.all([
      reserveClassifierRun(setup.adapter, setup.subject),
      reserveClassifierRun(setup.adapter, setup.subject),
    ])
    const again = await reserveClassifierRun(setup.adapter, setup.subject)
    const runIds = [left, right, again].map(result =>
      result.kind === 'reserved' ? result.run.runId : null,
    )
    expect(new Set(runIds).size).toBe(1)
    expect(runIds[0]).not.toBeNull()
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toHaveLength(1)
  })

  it('settles a request as no-work when the classifier has no configuration', async () => {
    const setup = await createSyntheticFixture()
    setup.state.configured = false
    await requestSyntheticRun(setup)

    expect(await reserveClassifierRun(setup.adapter, setup.subject)).toEqual({ kind: 'no-work' })

    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toEqual([])
    const [request] = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(request!.no_work_at).not.toBeNull()
    expect((await listPendingClassifierRunRequests(setup.adapter, null)).items).toEqual([])
  })

  it('settles a request as stale when the subject is no longer eligible', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    await setTestPostClearanceStatus(setup.post.id, 'pending')

    expect(await reserveClassifierRun(setup.adapter, setup.subject)).toEqual({ kind: 'stale' })

    const [request] = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    expect(request!.stale_at).not.toBeNull()
  })

  it('leaves the request pending while the classifier prerequisite is not ready', async () => {
    const setup = await createSyntheticFixture()
    setup.state.ready = false
    await requestSyntheticRun(setup)

    expect(await reserveClassifierRun(setup.adapter, setup.subject)).toEqual({ kind: 'not-ready' })

    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toEqual([])
    const pending = await listPendingClassifierRunRequests(setup.adapter, null)
    expect(pending.items.map(item => item.postId)).toEqual([setup.post.id])
  })

  it('keeps the request for the sweep when configuration cannot be resolved', async () => {
    const setup = await createSyntheticFixture()
    setup.state.unresolvable = true
    await requestSyntheticRun(setup)

    await expect(reserveClassifierRun(setup.adapter, setup.subject)).rejects.toThrow(
      'configuration is unavailable',
    )

    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toEqual([])
    const pending = await listPendingClassifierRunRequests(setup.adapter, null)
    expect(pending.items.map(item => item.postId)).toEqual([setup.post.id])
    setup.state.unresolvable = false
    expect((await reserveClassifierRun(setup.adapter, setup.subject)).kind).toBe('reserved')
  })

  it('re-arms a settled request on re-approval and reuses the one receipt', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const run = await reserveSyntheticRun(setup)

    await requestSyntheticRun(setup)
    const pending = await listPendingClassifierRunRequests(setup.adapter, null)
    expect(pending.items.map(item => item.postId)).toEqual([setup.post.id])

    const again = await reserveClassifierRun(setup.adapter, setup.subject)
    expect(again.kind === 'reserved' && again.run.runId).toBe(run.runId)
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toHaveLength(1)
    expect((await listPendingClassifierRunRequests(setup.adapter, null)).items).toEqual([])
  })

  it('marks an unsettled request for older content stale when newer content is requested', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const revised = await reviseSyntheticPost(setup.post.id)

    await requestSyntheticRun(setup, revised)

    const requests = await getClassifierRunRequestFacts(setup.post.id, setup.slug)
    const older = requests.find(request => request.input_sha256.equals(setup.post.inputSha256))
    const newer = requests.find(request => request.input_sha256.equals(revised))
    expect(older!.stale_at).not.toBeNull()
    expect(newer).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
  })

  it('writes no request when no classifier is asked for', async () => {
    const setup = await createSyntheticFixture()
    const before = await getClassifierRunRequestFacts(setup.post.id)

    await requestSyntheticRun(setup, setup.post.inputSha256, [])

    expect(await getClassifierRunRequestFacts(setup.post.id)).toEqual(before)
  })
})
