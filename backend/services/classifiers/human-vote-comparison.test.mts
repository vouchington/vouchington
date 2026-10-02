import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  postSubject,
  rssItemSubject,
  seedCommunityDecision,
  seedGlobalDecision,
  seedMoment,
} from '../../test-helpers/data-stores/psql/classifier-comparison-seeding.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { getClassifierHumanVoteComparison } from './get-classifier-human-vote-comparison.mts'
import type { ClassifierHumanVoteComparisonOptions } from './human-vote-comparison-types.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW = { from: seedMoment(-6), to: seedMoment(6) }

async function activatedFixture() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  return fixture
}

type Fixture = Awaited<ReturnType<typeof activatedFixture>>

async function reportOf(
  fixture: Fixture,
  options: Partial<ClassifierHumanVoteComparisonOptions> = {},
) {
  const result = await getClassifierHumanVoteComparison({
    classifierId: fixture.classifierId,
    ...WINDOW,
    ...options,
  })
  if (result.outcome !== 'ok') throw new Error(`expected a report, got ${result.outcome}`)
  return result.comparison
}

describe('getClassifierHumanVoteComparison request checks', () => {
  it.each([
    ['ends where it starts', { to: WINDOW.from }],
    ['ends before it starts', { from: WINDOW.to, to: WINDOW.from }],
    ['covers more than 31 days', { to: new Date(WINDOW.from.getTime() + 31 * DAY_MS + 1) }],
  ])('refuses a window that %s', async (_name, window) => {
    const fixture = await activatedFixture()

    const result = await getClassifierHumanVoteComparison({
      classifierId: fixture.classifierId,
      ...WINDOW,
      ...window,
    })

    expect(result.outcome).toBe('invalid')
  })

  it('accepts a window of exactly 31 days', async () => {
    const fixture = await activatedFixture()

    const comparison = await reportOf(fixture, {
      to: new Date(WINDOW.from.getTime() + 31 * DAY_MS),
    })

    expect(comparison.cells).toEqual([])
  })

  it('refuses to filter by a post and a feed item together', async () => {
    const fixture = await activatedFixture()

    const result = await getClassifierHumanVoteComparison({
      classifierId: fixture.classifierId,
      ...WINDOW,
      postId: fixture.postId,
      rssFeedItemId: fixture.rssFeedItemId,
    })

    expect(result.outcome).toBe('invalid')
  })

  it('does not find an unknown classifier', async () => {
    await expect(
      getClassifierHumanVoteComparison({ classifierId: randomUUID(), ...WINDOW }),
    ).resolves.toEqual({ outcome: 'not_found' })
  })

  it('only compares topic classifiers with the human topic votes', async () => {
    const fixture = await activatedFixture()

    const result = await getClassifierHumanVoteComparison({
      classifierId: fixture.storyClassifierId,
      ...WINDOW,
    })

    expect(result.outcome).toBe('unsupported')
  })
})

describe('getClassifierHumanVoteComparison cells', () => {
  it('groups decisions by probability tenth and the vote the effective thresholds gave', async () => {
    const fixture = await activatedFixture()
    for (const [index, probability] of [0.1, 0.5, 0.9, 1].entries()) {
      await seedGlobalDecision(fixture, { probability, at: seedMoment(index) })
    }

    const comparison = await reportOf(fixture)

    expect(comparison).toMatchObject({
      classifier_id: fixture.classifierId,
      batches_examined: 4,
      truncated: false,
      min_human_cohort: 20,
    })
    expect(comparison.cells).toMatchObject([
      { probability_lower: 0.1, probability_upper: 0.2, classifier_vote: -1, decisions: 1 },
      { probability_lower: 0.5, probability_upper: 0.6, classifier_vote: 0, decisions: 1 },
      { probability_lower: 0.9, probability_upper: 1, classifier_vote: 1, decisions: 2 },
    ])
    expect(comparison.cells[2]!.mean_probability).toBeCloseTo(0.95)
    expect(comparison.cells).toMatchObject([
      { human_decisions: 0, human_voters: 0, human: null },
      { human_decisions: 0, human_voters: 0, human: null },
      { human_decisions: 0, human_voters: 0, human: null },
    ])
  })

  it('compares against the effective thresholds the decision was made under', async () => {
    const fixture = await activatedFixture()
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    await seedCommunityDecision(fixture, { probability: 0.9, at: seedMoment(1) })
    await seedCommunityDecision(fixture, { probability: 0.28, at: seedMoment(2) })

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      // 0.28 is under the community override of 0.3 (but over the 0.25 default), so it voted -1.
      {
        probability_lower: 0.2,
        classifier_vote: -1,
        effective_lower_threshold: { min: 0.3, max: 0.3 },
        effective_upper_threshold: { min: 0.75, max: 0.75 },
      },
      {
        probability_lower: 0.9,
        classifier_vote: 1,
        decisions: 2,
        effective_lower_threshold: { min: 0.25, max: 0.3 },
        effective_upper_threshold: { min: 0.75, max: 0.75 },
      },
    ])
  })

  it('reads the window from its start inclusive to its end exclusive', async () => {
    const fixture = await activatedFixture()
    const from = seedMoment(0)
    const to = seedMoment(1)
    const at = (msecs: number) => new Date(msecs)
    await seedGlobalDecision(fixture, { probability: 0.1, at: at(from.getTime() - 1) })
    await seedGlobalDecision(fixture, { probability: 0.5, at: from })
    await seedGlobalDecision(fixture, { probability: 0.7, at: at(to.getTime() - 1) })
    await seedGlobalDecision(fixture, { probability: 0.9, at: to })

    const comparison = await reportOf(fixture, { from, to })

    expect(comparison.batches_examined).toBe(2)
    expect(comparison.cells.map(cell => cell.probability_lower)).toEqual([0.5, 0.7])
  })

  it('reports an empty window with no batches and no cells', async () => {
    const fixture = await activatedFixture()

    const comparison = await reportOf(fixture)

    expect(comparison).toMatchObject({ batches_examined: 0, truncated: false, cells: [] })
  })

  it('does not count a batch that is not complete', async () => {
    const fixture = await activatedFixture()
    const now = Date.now()
    const window = { from: new Date(now - 3_600_000), to: new Date(now + 3_600_000) }
    await fixture.createTopicBatch()
    await expect(reportOf(fixture, window)).resolves.toMatchObject({ batches_examined: 0 })

    await seedGlobalDecision(fixture, { probability: 0.9, at: new Date(now - 60_000) })

    await expect(reportOf(fixture, window)).resolves.toMatchObject({ batches_examined: 1 })
  })
})

describe('getClassifierHumanVoteComparison filters', () => {
  it('narrows to the decisions made for a post or for a feed item', async () => {
    const fixture = await activatedFixture()
    await seedGlobalDecision(fixture, {
      probability: 0.9,
      at: seedMoment(0),
      subject: postSubject(fixture),
    })
    await seedGlobalDecision(fixture, {
      probability: 0.1,
      at: seedMoment(1),
      subject: rssItemSubject(fixture),
    })

    const everything = await reportOf(fixture)
    const post = await reportOf(fixture, { postId: fixture.postId })
    const item = await reportOf(fixture, { rssFeedItemId: fixture.rssFeedItemId })

    expect(everything.cells.map(cell => cell.probability_lower)).toEqual([0.1, 0.9])
    expect(post).toMatchObject({ post_id: fixture.postId, batches_examined: 1 })
    expect(post.cells.map(cell => cell.probability_lower)).toEqual([0.9])
    expect(item).toMatchObject({ rss_feed_item_id: fixture.rssFeedItemId, batches_examined: 1 })
    expect(item.cells.map(cell => cell.probability_lower)).toEqual([0.1])
  })

  it('narrows to the decisions evaluated under a community scope', async () => {
    const fixture = await activatedFixture()
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    await seedCommunityDecision(fixture, { probability: 0.28, at: seedMoment(1) })

    const community = await reportOf(fixture, { communityId: fixture.communityId })
    const other = await reportOf(fixture, { communityId: randomUUID() })

    expect(community).toMatchObject({ community_id: fixture.communityId, batches_examined: 1 })
    expect(community.cells.map(cell => cell.probability_lower)).toEqual([0.2])
    expect(other).toMatchObject({ batches_examined: 0, cells: [] })
  })

  it('only reads the requested classifier', async () => {
    const fixture = await activatedFixture()
    const other = await activatedFixture()
    await seedGlobalDecision(other, { probability: 0.9, at: seedMoment(0) })

    const comparison = await reportOf(fixture)

    expect(comparison).toMatchObject({ batches_examined: 0, cells: [] })
  })
})
