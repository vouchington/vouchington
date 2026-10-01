import { reserveClassifierRun } from '@services/classifier-runs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  createNearbyTopic,
  embedAutotaggerPost,
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getClassifierRunCandidateTopicIdsForTest,
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { afterEach, describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'
import { autotaggerPaidLimitsConfig } from './limits-config.mts'

const adapter = createAutotaggerRunAdapter()
const restores: Array<() => void> = []

function overrideLimits(fields: Record<string, boolean | number>) {
  restores.push(overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, fields))
}

async function reservedRunId(subject: Parameters<typeof reserveClassifierRun>[1]) {
  const result = await reserveClassifierRun(adapter, subject)
  if (result.kind !== 'reserved') throw new Error(`Expected a reservation, got ${result.kind}`)
  return result.run.runId
}

const idsOf = (topics: Array<{ id: string }>) => new Set(topics.map(topic => topic.id))

describe('C6 run adapter reservation (real PG)', () => {
  afterEach(() => restores.splice(0).forEach(restore => restore()))

  it('reserves one receipt for an approved post and captures its candidate topics with it', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    await requestAutotaggerRun(fixture)

    const runId = await reservedRunId(fixture.subject)

    const [run] = await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)
    expect(run).toMatchObject({
      id: runId,
      decision_batch_id: expect.any(String),
      provider_attempts_started: 0,
      completed_at: null,
    })
    expect(run!.input_sha256.equals(fixture.inputSha256)).toBe(true)
    const captured = await getClassifierRunCandidateTopicIdsForTest(runId)
    expect(captured).toHaveLength(3)
    expect(new Set(captured)).toEqual(idsOf(fixture.topics))
    const [request] = await getSubjectClassifierRunRequestFacts(fixture.subject)
    expect(request).toMatchObject({ run_id: runId, no_work_at: null, stale_at: null })
  })

  it('never lets a changed search result mint a second receipt or change what the receipt asks', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const first = await reservedRunId(fixture.subject)
    const asked = await getClassifierRunCandidateTopicIdsForTest(first)
    await createNearbyTopic(fixture.embedding)

    const second = await reservedRunId(fixture.subject)

    expect(second).toBe(first)
    expect(await getClassifierRunCandidateTopicIdsForTest(first)).toEqual(asked)
    expect(
      await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG),
    ).toHaveLength(1)
  })

  it('never lets a tier cap change mint a second receipt or change what the receipt asks', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    const first = await reservedRunId(fixture.subject)
    overrideLimits({ post_plus_max_topics: 1 })

    const second = await reservedRunId(fixture.subject)

    expect(second).toBe(first)
    expect(await getClassifierRunCandidateTopicIdsForTest(first)).toHaveLength(3)
    expect(
      await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG),
    ).toHaveLength(1)
  })

  it.each([
    ['a free author', { plan: null }],
    ['a post with no similar topic', { topicCount: 0 }],
  ])('settles %s as no work and reserves nothing', async (_name, options) => {
    const fixture = await createAutotaggerPostFixture(options)
    await requestAutotaggerRun(fixture)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'no-work' })

    expect(await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)).toEqual([])
    const [request] = await getSubjectClassifierRunRequestFacts(fixture.subject)
    expect(request).toMatchObject({ run_id: null, no_work_at: expect.any(Date) })
  })

  it('leaves the request pending until the post embedding exists, then reserves it', async () => {
    const fixture = await createAutotaggerPostFixture({ embedded: false })
    await requestAutotaggerRun(fixture)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'not-ready' })

    expect(await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)).toEqual([])
    expect(await getSubjectClassifierRunRequestFacts(fixture.subject)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    await embedAutotaggerPost(fixture.post.id, fixture.embedding)
    expect((await reserveClassifierRun(adapter, fixture.subject)).kind).toBe('reserved')
  })

  it('settles the operator kill switch as no work', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerRun(fixture)
    overrideLimits({ enabled: false })

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'no-work' })

    expect(await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)).toEqual([])
  })

  it('settles a post that is no longer approved as stale', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerRun(fixture)
    await setTestPostClearanceStatus(fixture.post.id, 'pending')

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'stale' })

    const [request] = await getSubjectClassifierRunRequestFacts(fixture.subject)
    expect(request!.stale_at).not.toBeNull()
  })

  it('reserves a feed item with no approval gate, capturing candidates without a post', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 2 })
    await requestAutotaggerRun(fixture)

    const runId = await reservedRunId(fixture.subject)

    const [run] = await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)
    expect(run).toMatchObject({ id: runId, post_id: null, rss_feed_item_id: fixture.itemId })
    expect(new Set(await getClassifierRunCandidateTopicIdsForTest(runId))).toEqual(
      idsOf(fixture.topics),
    )
  })

  it('leaves a feed item pending until it is embedded, and settles a non-discoverable one', async () => {
    const waiting = await createAutotaggerFeedItemFixture({ embedded: false })
    const hidden = await createAutotaggerFeedItemFixture({ discoverable: false })
    await Promise.all([requestAutotaggerRun(waiting), requestAutotaggerRun(hidden)])

    expect(await reserveClassifierRun(adapter, waiting.subject)).toEqual({ kind: 'not-ready' })
    expect(await reserveClassifierRun(adapter, hidden.subject)).toEqual({ kind: 'no-work' })

    expect(await getSubjectClassifierRunRequestFacts(waiting.subject)).toMatchObject([
      { no_work_at: null },
    ])
    expect(await getSubjectClassifierRunRequestFacts(hidden.subject)).toMatchObject([
      { run_id: null, no_work_at: expect.any(Date) },
    ])
  })
})
