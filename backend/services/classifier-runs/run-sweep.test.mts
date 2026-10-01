import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
  markClassifierRunTerminalForTest,
  setClassifierRunSweepEnqueueCountForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createSyntheticFixture,
  reviseSyntheticPost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  leaseSyntheticRun,
  requestSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import {
  listIncompleteClassifierRuns,
  listPendingClassifierRunRequests,
  type IncompleteClassifierRun,
} from './run-discovery.mts'
import { completeClassifierRun } from './run-completion.mts'
import { reserveClassifierRun } from './run-reservation.mts'
import { persistClassifierRunOutcomes } from './run-outcomes.mts'
import {
  abandonClassifierRunSweep,
  CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND,
  recordClassifierRunSweepEnqueues,
} from './run-sweep.mts'

/** Drains every page (the shared test database holds other suites' runs) with a tiny page size. */
async function drainIncompleteRuns(): Promise<IncompleteClassifierRun[]> {
  const runs: IncompleteClassifierRun[] = []
  let after: string | null = null
  do {
    const page = await listIncompleteClassifierRuns(after, 2)
    expect(page.items.length).toBeLessThanOrEqual(2)
    runs.push(...page.items)
    after = page.next
  } while (after)
  return runs
}

describe('classifier run sweep discovery (real PG)', () => {
  it('discovers an approved subject that never reserved a receipt, once', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)

    const found = await listPendingClassifierRunRequests(setup.adapter, null)
    expect(found.items.map(item => item.postId)).toEqual([setup.post.id])
    expect(found.next).toBeNull()

    await reserveSyntheticRun(setup)
    expect((await listPendingClassifierRunRequests(setup.adapter, null)).items).toEqual([])
  })

  it('paginates request discovery by keyset and returns each request exactly once', async () => {
    const setup = await createSyntheticFixture()
    const other = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    await requestSyntheticRun({ ...other, slug: setup.slug })

    const first = await listPendingClassifierRunRequests(setup.adapter, null, 1)
    expect(first.items).toHaveLength(1)
    expect(first.next).not.toBeNull()
    const second = await listPendingClassifierRunRequests(setup.adapter, first.next, 1)
    const third = await listPendingClassifierRunRequests(setup.adapter, second.next, 1)

    expect(second.items).toHaveLength(1)
    expect(third.items).toEqual([])
    expect(third.next).toBeNull()
    expect(new Set([first.items[0]!.postId, second.items[0]!.postId])).toEqual(
      new Set([setup.post.id, other.post.id]),
    )
  })

  it('does not discover a request that is ineligible, settled or for older content', async () => {
    const unapproved = await createSyntheticFixture()
    await requestSyntheticRun(unapproved)
    await setTestPostClearanceStatus(unapproved.post.id, 'pending')
    expect((await listPendingClassifierRunRequests(unapproved.adapter, null)).items).toEqual([])

    const revised = await createSyntheticFixture()
    await requestSyntheticRun(revised)
    await reviseSyntheticPost(revised.post.id)
    expect((await listPendingClassifierRunRequests(revised.adapter, null)).items).toEqual([])

    const noWork = await createSyntheticFixture()
    noWork.state.configured = false
    await requestSyntheticRun(noWork)
    await reserveClassifierRun(noWork.adapter, noWork.subject)
    expect((await listPendingClassifierRunRequests(noWork.adapter, null)).items).toEqual([])
  })

  it('lists exactly the recoverable runs across pages', async () => {
    const open = await createSyntheticFixture()
    const done = await createSyntheticFixture()
    const failed = await createSyntheticFixture()
    const openRun = await reserveSyntheticRun(open)
    const { run: doneRun, lease } = await leaseSyntheticRun(done)
    await persistClassifierRunOutcomes(done.adapter, { lease })
    await completeClassifierRun(done.adapter, lease)
    const failedRun = await reserveSyntheticRun(failed)
    await markClassifierRunTerminalForTest(failedRun.runId, 'provider-error')

    const listed = await drainIncompleteRuns()
    const ids = listed.map(run => run.runId)

    expect(ids).toContain(openRun.runId)
    expect(ids).not.toContain(doneRun.runId)
    expect(ids).not.toContain(failedRun.runId)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].toSorted()).toEqual(ids)
    const found = listed.find(run => run.runId === openRun.runId)!
    expect(found).toMatchObject({
      classifier: open.slug,
      postId: open.post.id,
      rssFeedItemId: null,
      sweepEnqueueCount: 0,
    })
    expect(found.inputSha256).toBe(open.post.inputSha256.toString('hex'))
  })

  it('keeps an expired-lease run recoverable', async () => {
    const setup = await createSyntheticFixture()
    const { run } = await leaseSyntheticRun(setup)
    await expireClassifierRunLeaseForTest(run.runId)

    expect((await drainIncompleteRuns()).map(item => item.runId)).toContain(run.runId)
  })
})

describe('classifier run sweep bound (real PG)', () => {
  it('counts only enqueues that added a job, and stops counting past the bound', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)

    await recordClassifierRunSweepEnqueues([])
    await recordClassifierRunSweepEnqueues([run.runId])
    expect((await getClassifierRunFacts(setup.post.id, setup.slug))[0]!.sweep_enqueue_count).toBe(1)

    await setClassifierRunSweepEnqueueCountForTest(
      run.runId,
      CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND + 1,
    )
    await recordClassifierRunSweepEnqueues([run.runId])
    expect((await getClassifierRunFacts(setup.post.id, setup.slug))[0]!.sweep_enqueue_count).toBe(
      CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND + 1,
    )
  })

  it('abandons a run exactly at the bound as a terminal failure, and only then', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)

    expect(await abandonClassifierRunSweep(run.runId)).toBe('skipped')
    await setClassifierRunSweepEnqueueCountForTest(run.runId, CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND)
    expect((await drainIncompleteRuns()).map(item => item.runId)).toContain(run.runId)

    expect(await abandonClassifierRunSweep(run.runId)).toBe('terminal')
    expect(await abandonClassifierRunSweep(run.runId)).toBe('skipped')
    const [facts] = await getClassifierRunFacts(setup.post.id, setup.slug)
    expect(facts).toMatchObject({
      terminal_failure_kind: 'sweep-bound-exceeded',
      sweep_enqueue_count: CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND + 1,
    })
    expect((await drainIncompleteRuns()).map(item => item.runId)).not.toContain(run.runId)
  })
})
