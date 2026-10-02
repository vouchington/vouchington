import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { CLASSIFIER_RUN_ATTEMPTS } from '@queues/ai-agents/config'
import { ai_agents } from '@queues/ai-agents/queues'
import { openAiSpendCapConfig } from '@services/ai-usage'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import { findAiUsageRecordForPost, pollUntilNotNull } from '@voucha/test-helpers'
import {
  classifierRunDispatcherJobFor,
  classifierRunDispatcherJobForFeedItem,
  classifierRunJobFor,
  createClassifierRunSweepScope,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  readClassifierRunDispatcherJobsForTest,
  readClassifierRunJobsForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import {
  AUTOTAGGER_AGENT_SLUG,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { readLiveSubjectTopicIds } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { toClassifierRunJobData } from './classifier-run-handler.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processClassifierRun, processClassifierRunDispatcher } from './process-classifier-run.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const tagging = getClassifierRunHandler(TAGGING_CLASSIFIER_SLUG)
const agent = getClassifierRunHandler(AUTOTAGGER_AGENT_SLUG)
const provider = vi.mocked(fetchStructuredDecisionProvider)

/** Every question set the provider was asked, in call order: C6's first, then C7's. */
let askedQuestionSets: string[][] = []

/** Points the mocked provider at an answer function: the probability it gives each question id. */
function answerWith(probabilityFor: (questionId: string) => number) {
  provider.mockImplementation(async (_url, init) => {
    const body = JSON.parse(stringFromUnknown(init?.body)) as {
      questions: Record<string, unknown>
    }
    const ids = Object.keys(body.questions)
    askedQuestionSets.push(ids)
    return Response.json({
      id: `decision-${randomUUID()}`,
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
      answers: ids.map(id => ({ id, type: 'noul', noul: probabilityFor(id) })),
    })
  })
}

type Fixture =
  | Awaited<ReturnType<typeof createAutotaggerPostFixture>>
  | Awaited<ReturnType<typeof createAutotaggerFeedItemFixture>>

const subjectIdOf = ({ subject }: { subject: ClassifierRunSubject }) =>
  subject.postId ?? subject.rssFeedItemId!

/** A post or feed item with three topics a paying member follows, as C7's universe needs. */
async function followedFixture<T extends Fixture>(create: () => Promise<T>): Promise<T> {
  const fixture = await create()
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  return fixture
}

const followedPost = () => followedFixture(() => createAutotaggerPostFixture({ topicCount: 3 }))

/** C6 through the real worker: it applies `applied` and rejects every other question it asks. */
async function tagWith(fixture: Fixture, applied: readonly string[]) {
  answerWith(id => (applied.includes(id) ? 0.9 : 0.1))
  await requestAutotaggerRun(fixture)
  const reserved = await tagging.reserve(fixture.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  const data = toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, reserved.run)
  return { data, run: () => processClassifierRun(classifierRunJobFor(data)) }
}

const agentDispatcherJob = ({ subject }: { subject: ClassifierRunSubject }) =>
  subject.postId !== null
    ? classifierRunDispatcherJobFor(subject.postId, AUTOTAGGER_AGENT_SLUG)
    : classifierRunDispatcherJobForFeedItem(subject.rssFeedItemId, AUTOTAGGER_AGENT_SLUG)

/** The C7 dispatcher jobs queued for the subject, whatever else the shared queue holds. */
async function agentDispatchers(fixture: Fixture) {
  return (await readClassifierRunDispatcherJobsForTest(subjectIdOf(fixture))).filter(
    job => (job.data as { classifier?: string }).classifier === AUTOTAGGER_AGENT_SLUG,
  )
}

/** C7's dispatcher step, then the run job the shared lifecycle would execute. */
async function dispatchAgentRun(fixture: Fixture) {
  await expect(processClassifierRunDispatcher(agentDispatcherJob(fixture))).resolves.toEqual({
    kind: 'enqueued',
  })
  const reserved = await agent.reserve(fixture.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  const data = toClassifierRunJobData(AUTOTAGGER_AGENT_SLUG, reserved.run)
  return {
    data,
    runId: reserved.run.runId,
    run: () => processClassifierRun(classifierRunJobFor(data)),
  }
}

const agentRuns = (fixture: Fixture) =>
  getSubjectClassifierRunFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG)

describe('C7 reasoning autotagger through the shared lifecycle (real PG, mocked provider)', () => {
  let restoreSpendCap: (() => void) | undefined
  beforeAll(async () => {
    await openAiSpendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
  })
  beforeEach(() => {
    askedQuestionSets = []
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    answerWith(() => 0.9)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })
  afterAll(() => restoreSpendCap?.())

  describe.each<[string, () => Promise<Fixture>]>([
    ['post', () => createAutotaggerPostFixture({ topicCount: 3 })],
    ['RSS feed item', () => createAutotaggerFeedItemFixture({ topicCount: 3 })],
  ])('after C6 for a %s', (_name, create) => {
    it('is requested durably and dispatched once C6 completes, however often C6 replays', async () => {
      const fixture = await followedFixture(create)
      const { run } = await tagWith(fixture, [fixture.topics[0]!.id])
      expect(await agentDispatchers(fixture)).toEqual([])

      await expect(run()).resolves.toEqual({ kind: 'completed' })
      await expect(run()).resolves.toEqual({ kind: 'replay' })

      expect(await agentDispatchers(fixture)).toHaveLength(1)
      expect(
        await getSubjectClassifierRunRequestFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
      ).toMatchObject([{ run_id: null, no_work_at: null, stale_at: null }])
    })

    it('asks only what C6 did not apply, in one billed provider call, and adds what it accepts', async () => {
      const fixture = await followedFixture(create)
      const [applied, second, third] = fixture.topics.map(topic => topic.id) as [
        string,
        string,
        string,
      ]
      await (await tagWith(fixture, [applied])).run()
      expect(await readLiveSubjectTopicIds(fixture.subject)).toEqual([applied])
      answerWith(id => (id === second ? 0.9 : 0.1))

      const dispatched = await dispatchAgentRun(fixture)
      await expect(dispatched.run()).resolves.toEqual({ kind: 'completed' })

      expect(provider).toHaveBeenCalledTimes(2)
      expect(askedQuestionSets[1]).toEqual(expect.arrayContaining([second, third]))
      expect(askedQuestionSets[1]).not.toContain(applied)
      expect(await readLiveSubjectTopicIds(fixture.subject)).toEqual([applied, second].toSorted())
      expect(await agentRuns(fixture)).toMatchObject([
        { provider_attempts_started: 1, completed_at: expect.any(Date) },
      ])
      expect(await readClassifierRunJobsForTest(dispatched.runId)).toHaveLength(1)
    })

    it('replays a completed run without reserving, billing or applying anything a second time', async () => {
      const fixture = await followedFixture(create)
      await (await tagWith(fixture, [fixture.topics[0]!.id])).run()
      const dispatched = await dispatchAgentRun(fixture)
      await dispatched.run()
      const added = await readLiveSubjectTopicIds(fixture.subject)

      await expect(dispatched.run()).resolves.toEqual({ kind: 'replay' })
      await expect(dispatched.run()).resolves.toEqual({ kind: 'replay' })

      expect(provider).toHaveBeenCalledTimes(2)
      expect(await readLiveSubjectTopicIds(fixture.subject)).toEqual(added)
      expect(await agentRuns(fixture)).toMatchObject([{ provider_attempts_started: 1 }])
    })

    it('ends at the attempt cap and never reaches the provider again, leaving C6’s tags alone', async () => {
      const fixture = await followedFixture(create)
      const { applied } = { applied: fixture.topics[0]!.id }
      await (await tagWith(fixture, [applied])).run()
      const dispatched = await dispatchAgentRun(fixture)
      provider.mockRejectedValue(new Error('provider unreachable'))
      const attempt = () =>
        processClassifierRun(classifierRunJobFor(dispatched.data)).then(
          result => result.kind,
          () => 'threw',
        )

      const outcomes: string[] = []
      for (let tries = 0; tries <= CLASSIFIER_RUN_ATTEMPTS; tries += 1)
        outcomes.push(await attempt())

      expect(provider).toHaveBeenCalledTimes(1 + CLASSIFIER_RUN_ATTEMPTS)
      expect(outcomes.at(-1)).toBe('terminal')
      expect(await agentRuns(fixture)).toMatchObject([
        {
          provider_attempts_started: CLASSIFIER_RUN_ATTEMPTS,
          terminal_failure_kind: 'provider-error',
        },
      ])
      expect(await readLiveSubjectTopicIds(fixture.subject)).toEqual([applied])
    })
  })

  it('bills the reasoning pass under its own workload, apart from the first stage', async () => {
    const fixture = await followedPost()
    await (await tagWith(fixture, [fixture.topics[0]!.id])).run()
    await (await dispatchAgentRun(fixture)).run()

    const { id } = fixture.post
    await expect(
      pollUntilNotNull(() => findAiUsageRecordForPost(id, AUTOTAGGER_AGENT_SLUG)),
    ).resolves.toMatchObject({ input_tokens: 12 })
    await expect(
      pollUntilNotNull(() => findAiUsageRecordForPost(id, 'autotagger')),
    ).resolves.toMatchObject({ input_tokens: 12 })
  })

  describe('recovery', () => {
    const requests = { phase: 'requests', classifier: AUTOTAGGER_AGENT_SLUG } as const
    const scope = createClassifierRunSweepScope(agent)

    it('fails the C6 job when the C7 dispatcher cannot be enqueued, so the queue retries it', async () => {
      const fixture = await followedPost()
      const { run } = await tagWith(fixture, [fixture.topics[0]!.id])
      const add = vi.spyOn(ai_agents, 'add').mockRejectedValueOnce(new Error('queue unavailable'))

      await expect(run()).rejects.toThrow('queue unavailable')
      add.mockRestore()

      expect(await agentDispatchers(fixture)).toEqual([])
      expect(
        await getSubjectClassifierRunRequestFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
      ).toMatchObject([{ run_id: null }])
      await expect(run()).resolves.toEqual({ kind: 'replay' })
      expect(await agentDispatchers(fixture)).toHaveLength(1)
    })

    it('lets the sweep dispatch a C7 request whose C6 job never enqueued it, once however often it runs', async () => {
      scope.reset()
      const fixture = await followedPost()
      const { run } = await tagWith(fixture, [fixture.topics[0]!.id])
      const add = vi.spyOn(ai_agents, 'add').mockRejectedValueOnce(new Error('queue unavailable'))
      await expect(run()).rejects.toThrow('queue unavailable')
      add.mockRestore()
      scope.postIds.add(subjectIdOf(fixture))
      const sweep = () => processReconcileClassifierRuns(requests, scope.dependencies())

      await expect(sweep()).resolves.toEqual({ kind: 'requests', dispatched: 1, hasNext: false })
      await sweep()

      expect(await agentDispatchers(fixture)).toHaveLength(1)
      expect(await agentRuns(fixture)).toEqual([])
    })
  })
})
