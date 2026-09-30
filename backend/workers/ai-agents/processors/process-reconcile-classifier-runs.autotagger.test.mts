import { beforeEach, describe, expect, it } from 'vitest'
import { createClassifierRunSweepScope } from '@voucha/test-helpers/classifier-run-worker'
import {
  autotaggerDispatcherJobFor,
  dispatchAutotaggerSubject,
} from '@voucha/test-helpers/autotagger-run-worker'
import {
  readClassifierRunDispatcherJobsForTest,
  readClassifierRunJobsForTest,
  removeClassifierRunJobForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  embedAutotaggerFeedItem,
  embedAutotaggerPost,
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  expireClassifierRunLeaseForTest,
  getSubjectClassifierRunFacts,
  markClassifierRunTerminalForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { claimClassifierRun, startClassifierProviderAttempt } from '@services/classifier-runs'
import { createAutotaggerRunAdapter } from '@services/autotagger'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processClassifierRunDispatcher } from './process-classifier-run.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

const scope = createClassifierRunSweepScope(getClassifierRunHandler(TAGGING_CLASSIFIER_SLUG))
const sweep = (data = {}, overrides = {}, pageSize = 500) =>
  processReconcileClassifierRuns(data, scope.dependencies(overrides, pageSize))
const requests = { phase: 'requests', classifier: TAGGING_CLASSIFIER_SLUG } as const
const dispatched = (count: number) => ({ kind: 'requests', dispatched: count, hasNext: false })

type Fixture =
  | Awaited<ReturnType<typeof createAutotaggerPostFixture>>
  | Awaited<ReturnType<typeof createAutotaggerFeedItemFixture>>

const subjectIdOf = (fixture: Fixture) => fixture.subject.postId ?? fixture.subject.rssFeedItemId

function track({ subject }: Fixture, runId?: string) {
  if (subject.postId === null) scope.rssFeedItemIds.add(subject.rssFeedItemId)
  else scope.postIds.add(subject.postId)
  if (runId) scope.runIds.add(runId)
}

/** A requested subject the sweep can see, whose dispatcher has not run yet. */
async function requested<T extends Fixture>(fixture: T): Promise<T> {
  track(fixture)
  await requestAutotaggerRun(fixture)
  return fixture
}

/** A requested subject reserved by the real dispatcher, with its run job queued. */
async function dispatchedRun(fixture: Fixture) {
  const run = await dispatchAutotaggerSubject(fixture)
  track(fixture, run.runId)
  return run
}

const runFacts = async (fixture: Fixture) =>
  (await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG))[0]!

describe('C6 recovery sweep: request discovery', () => {
  beforeEach(() => scope.reset())

  it('dispatches an approved post that never got a run, once, however many sweeps overlap', async () => {
    const fixture = await requested(await createAutotaggerPostFixture())

    await expect(sweep(requests)).resolves.toEqual(dispatched(1))
    await sweep(requests)

    expect(await readClassifierRunDispatcherJobsForTest(subjectIdOf(fixture)!)).toHaveLength(1)
    expect(await getSubjectClassifierRunFacts(fixture.subject)).toEqual([])
  })

  it('recovers an approval whose first dispatcher enqueue was lost, with one run however it retries', async () => {
    const fixture = await requested(await createAutotaggerPostFixture())
    expect(await readClassifierRunDispatcherJobsForTest(subjectIdOf(fixture)!)).toEqual([])

    await sweep(requests)
    await processClassifierRunDispatcher(autotaggerDispatcherJobFor(fixture.subject))
    await processClassifierRunDispatcher(autotaggerDispatcherJobFor(fixture.subject))
    await sweep(requests)

    const runs = await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)
    expect(runs).toHaveLength(1)
    expect(await readClassifierRunJobsForTest(runs[0]!.id)).toHaveLength(1)
  })

  it('holds an unembedded post back and dispatches it once its embedding exists', async () => {
    const fixture = await requested(await createAutotaggerPostFixture({ embedded: false }))

    await expect(sweep(requests)).resolves.toEqual(dispatched(0))
    await embedAutotaggerPost(fixture.post.id, fixture.embedding)

    await expect(sweep(requests)).resolves.toEqual(dispatched(1))
    expect(await readClassifierRunDispatcherJobsForTest(fixture.post.id)).toHaveLength(1)
  })

  it('holds an unembedded RSS feed item back and dispatches it once, with no approval involved', async () => {
    const fixture = await requested(await createAutotaggerFeedItemFixture({ embedded: false }))

    await expect(sweep(requests)).resolves.toEqual(dispatched(0))
    await embedAutotaggerFeedItem(fixture.itemId, fixture.embedding)

    await expect(sweep(requests)).resolves.toEqual(dispatched(1))
    await sweep(requests)
    expect(await readClassifierRunDispatcherJobsForTest(fixture.itemId)).toHaveLength(1)
  })

  it('never discovers an approved post that has no request, so pre-cutover posts are not backfilled', async () => {
    const fixture = await createAutotaggerPostFixture()
    scope.postIds.add(fixture.post.id)

    await expect(sweep(requests)).resolves.toEqual(dispatched(0))

    expect(await readClassifierRunDispatcherJobsForTest(fixture.post.id)).toEqual([])
    expect(await getSubjectClassifierRunFacts(fixture.subject)).toEqual([])
  })

  it('stops discovering a subject once its run is reserved', async () => {
    const fixture = await requested(await createAutotaggerPostFixture())
    await sweep(requests)

    await getClassifierRunHandler(TAGGING_CLASSIFIER_SLUG).reserve(fixture.subject)

    await expect(sweep(requests)).resolves.toEqual(dispatched(0))
  })

  it('stops before dispatching anything while the provider spend cap is breached', async () => {
    const fixture = await requested(await createAutotaggerPostFixture())
    const breached = {
      evaluateSpendCap: async () => ({
        reason: 'cap_exceeded' as const,
        dailyCapMicrounits: 1,
        day: '2026-09-30',
        totalMicrounits: 2,
      }),
    }

    await expect(sweep(requests, breached)).resolves.toEqual({ kind: 'spend-cap-breach' })

    expect(await readClassifierRunDispatcherJobsForTest(fixture.post.id)).toEqual([])
  })
})

describe('C6 recovery sweep: incomplete runs', () => {
  beforeEach(() => scope.reset())

  it('re-queues a post run whose job is gone once, and leaves one whose job is still queued', async () => {
    const fixture = await createAutotaggerPostFixture()
    const { runId } = await dispatchedRun(fixture)

    await sweep()
    expect((await runFacts(fixture)).sweep_enqueue_count).toBe(0)

    removeClassifierRunJobForTest(runId)
    await sweep()
    await sweep()

    expect(await readClassifierRunJobsForTest(runId)).toHaveLength(1)
    expect((await runFacts(fixture)).sweep_enqueue_count).toBe(1)
  })

  it('re-queues an RSS feed item run whose job is gone', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const { runId } = await dispatchedRun(fixture)
    removeClassifierRunJobForTest(runId)

    await sweep()

    expect(await readClassifierRunJobsForTest(runId)).toHaveLength(1)
    expect((await runFacts(fixture)).sweep_enqueue_count).toBe(1)
  })

  it('re-queues a run with attempts left after its lease expired', async () => {
    const fixture = await createAutotaggerPostFixture()
    const { runId, data } = await dispatchedRun(fixture)
    const adapter = createAutotaggerRunAdapter()
    const claim = await claimClassifierRun(adapter, {
      runId,
      subject: fixture.subject,
      inputSha256: fixture.inputSha256,
      configurationSha256: Buffer.from(data.configurationSha256, 'hex'),
      leaseSeconds: 60,
    })
    if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
    await startClassifierProviderAttempt(adapter, { lease: claim.lease, maxAttempts: 3 })
    await expireClassifierRunLeaseForTest(runId)
    removeClassifierRunJobForTest(runId)

    await sweep()

    expect(await readClassifierRunJobsForTest(runId)).toHaveLength(1)
    expect(await runFacts(fixture)).toMatchObject({
      provider_attempts_started: 1,
      sweep_enqueue_count: 1,
      terminal_failure_kind: null,
    })
  })

  it.each(['provider-error', 'invalid-result', 'context-rejected', 'attempts-exhausted'])(
    'never re-queues a run that ended permanently as %s',
    async kind => {
      const fixture = await createAutotaggerPostFixture()
      const { runId } = await dispatchedRun(fixture)
      await markClassifierRunTerminalForTest(runId, kind)
      removeClassifierRunJobForTest(runId)

      await sweep()
      await sweep()

      expect(await readClassifierRunJobsForTest(runId)).toHaveLength(0)
      expect((await runFacts(fixture)).sweep_enqueue_count).toBe(0)
    },
  )
})
