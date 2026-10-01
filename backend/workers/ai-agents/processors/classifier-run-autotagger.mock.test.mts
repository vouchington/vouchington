import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutotaggerClient, executeAutotaggerRun } from '@agents/autotagger'
import { fetchStructuredDecisionProvider } from '@modules/structured-decisions/transport'
import { AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'
import { openAiSpendCapConfig } from '@services/ai-usage'
import { createAutotaggerRunAdapter } from '@services/autotagger'
import { claimClassifierRun } from '@services/classifier-runs'
import { classifierRunJobFor } from '@voucha/test-helpers/classifier-run-worker'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  createNearbyTopic,
  readAutotaggerVotedTopicIds,
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  expireClassifierRunLeaseForTest,
  getClassifierRunCandidateTopicIdsForTest,
  getSubjectClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { toClassifierRunJobData } from './classifier-run-handler.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processClassifierRun } from './process-classifier-run.mts'

vi.mock<typeof import('@modules/structured-decisions/transport')>(
  import('@modules/structured-decisions/transport'),
  async original => ({
    ...(await original()),
    fetchStructuredDecisionProvider: vi.fn<typeof fetchStructuredDecisionProvider>(),
  }),
)

const handler = getClassifierRunHandler(TAGGING_CLASSIFIER_SLUG)
const adapter = createAutotaggerRunAdapter()
const provider = vi.mocked(fetchStructuredDecisionProvider)

/** Every question set the provider was asked, in call order. */
let askedQuestionSets: string[][] = []

function answerEveryQuestion() {
  provider.mockImplementation(async (_url, init) => {
    const body = JSON.parse(stringFromUnknown(init?.body)) as { questions: Record<string, unknown> }
    const ids = Object.keys(body.questions)
    askedQuestionSets.push(ids)
    return Response.json({
      id: `decision-${randomUUID()}`,
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
      answers: ids.map(id => ({ id, type: 'noul', noul: 0.9 })),
    })
  })
}

type Fixture =
  | Awaited<ReturnType<typeof createAutotaggerPostFixture>>
  | Awaited<ReturnType<typeof createAutotaggerFeedItemFixture>>

/** The durable request and the reservation the dispatcher would make, without queueing the job. */
async function reserveRun(fixture: Fixture) {
  await requestAutotaggerRun(fixture)
  const reserved = await handler.reserve(fixture.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  return reserved.run
}

const runFacts = async (fixture: Fixture) =>
  (await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG))[0]

const idsOf = (topics: Array<{ id: string }>) => topics.map(topic => topic.id).toSorted()

/** Runs `attempt` `times` times in sequence, as a queue's retries do. */
async function drain(attempt: () => Promise<string>, times: number): Promise<string[]> {
  return times === 0 ? [] : [await attempt(), ...(await drain(attempt, times - 1))]
}

describe('C6 classifier run through the shared lifecycle (real PG, mocked provider)', () => {
  let restoreSpendCap: (() => void) | undefined
  beforeAll(async () => {
    await openAiSpendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
  })
  beforeEach(() => {
    askedQuestionSets = []
    vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    answerEveryQuestion()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    provider.mockReset()
  })
  afterAll(() => restoreSpendCap?.())

  it('asks one question per captured topic in one provider call, then applies the votes', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    const run = await reserveRun(fixture)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(provider).toHaveBeenCalledOnce()
    expect(askedQuestionSets.map(ids => ids.toSorted())).toEqual([idsOf(fixture.topics)])
    expect(await runFacts(fixture)).toMatchObject({
      provider_attempts_started: 1,
      completed_at: expect.any(Date),
    })
    expect(await readAutotaggerVotedTopicIds(fixture.subject)).toEqual(idsOf(fixture.topics))
  })

  it('replays a completed run without reserving or billing a second provider attempt', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const data = toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, await reserveRun(fixture))
    await processClassifierRun(classifierRunJobFor(data))

    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'replay',
    })
    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'replay',
    })

    expect(provider).toHaveBeenCalledOnce()
    expect(await runFacts(fixture)).toMatchObject({ provider_attempts_started: 1 })
  })

  it('completes a run whose lease expired after its decision persisted, without asking again', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const run = await reserveRun(fixture)
    const claim = await claimClassifierRun(adapter, {
      runId: run.runId,
      subject: run.subject,
      inputSha256: run.inputSha256,
      configurationSha256: run.configurationSha256,
      leaseSeconds: 60,
    })
    if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
    const { lease } = claim
    await expect(
      executeAutotaggerRun(
        {
          adapter,
          lease,
          maxAttempts: AI_AGENTS_DEFAULTS.attempts,
          signal: AbortSignal.timeout(30_000),
        },
        {
          createClient: (hooks, current) =>
            createAutotaggerClient({
              postId: current.subject.postId,
              modelProvider: current.resolved.configuration.modelProvider,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
    ).resolves.toBe('persisted')
    await expireClassifierRunLeaseForTest(run.runId)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(provider).toHaveBeenCalledOnce()
    expect(await runFacts(fixture)).toMatchObject({
      provider_attempts_started: 1,
      completed_at: expect.any(Date),
    })
  })

  it('keeps asking the captured questions when the candidate search would now return more', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const run = await reserveRun(fixture)
    const captured = (await getClassifierRunCandidateTopicIdsForTest(run.runId)).toSorted()
    await createNearbyTopic(fixture.embedding, 0.0001)

    const reserved = await handler.reserve(fixture.subject)
    expect(reserved).toMatchObject({ kind: 'reserved', run: { runId: run.runId } })
    await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, run)),
    )

    expect(askedQuestionSets.map(ids => ids.toSorted())).toEqual([captured])
    expect(
      await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG),
    ).toHaveLength(1)
  })

  it('runs an RSS feed item, which has no post and no approval gate, the same way', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 2 })
    const run = await reserveRun(fixture)

    const result = await processClassifierRun(
      classifierRunJobFor(toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, run)),
    )

    expect(result).toEqual({ kind: 'completed' })
    expect(provider).toHaveBeenCalledOnce()
    expect(await runFacts(fixture)).toMatchObject({
      post_id: null,
      rss_feed_item_id: fixture.itemId,
      provider_attempts_started: 1,
    })
    expect(await readAutotaggerVotedTopicIds(fixture.subject)).toEqual(idsOf(fixture.topics))
  })

  it('ends the run at the attempt cap and never reaches the provider again', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const data = toClassifierRunJobData(TAGGING_CLASSIFIER_SLUG, await reserveRun(fixture))
    provider.mockRejectedValue(new Error('provider unreachable'))
    const attempt = () =>
      processClassifierRun(classifierRunJobFor(data)).then(
        result => result.kind,
        () => 'threw',
      )

    const outcomes = await drain(attempt, AI_AGENTS_DEFAULTS.attempts + 1)

    expect(provider).toHaveBeenCalledTimes(AI_AGENTS_DEFAULTS.attempts)
    expect(outcomes.at(-1)).toBe('terminal')
    expect(await runFacts(fixture)).toMatchObject({
      provider_attempts_started: AI_AGENTS_DEFAULTS.attempts,
      terminal_failure_kind: 'provider-error',
    })
  })
})
