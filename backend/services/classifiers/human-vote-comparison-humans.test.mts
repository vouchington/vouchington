import { describe, expect, it } from 'vitest'
import {
  type Ballot,
  createHumanVoters,
  postSubject,
  recordClearedTopicBallot,
  recordHumanTopicVotes,
  recordSystemTopicVote,
  seedGlobalDecision,
  seedMoment,
} from '../../test-helpers/data-stores/psql/classifier-comparison-seeding.mts'
import { castHumanTopicRelationVote } from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { getClassifierHumanVoteComparison } from './get-classifier-human-vote-comparison.mts'

const WINDOW = { from: seedMoment(-6), to: seedMoment(6) }
const UP = 1
const DOWN = -1
const NEUTRAL = 0

async function activatedFixture() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  return fixture
}

type Fixture = Awaited<ReturnType<typeof activatedFixture>>

async function reportOf(fixture: Fixture) {
  const result = await getClassifierHumanVoteComparison({
    classifierId: fixture.classifierId,
    ...WINDOW,
  })
  if (result.outcome !== 'ok') throw new Error(`expected a report, got ${result.outcome}`)
  return result.comparison
}

/** Twenty humans, whose ballots net to one up vote: 10 up, 9 down and a neutral ballot. */
const NETS_UP_WITH_TWENTY: Ballot[] = [
  ...Array<1>(10).fill(UP),
  ...Array<-1>(9).fill(DOWN),
  NEUTRAL,
]

describe('getClassifierHumanVoteComparison human outcomes', () => {
  it('counts each decision by the sign of what its human voters net', async () => {
    const fixture = await activatedFixture()
    const voters = await createHumanVoters(21)
    const ballotsByPost = [
      [UP, UP, UP, UP, UP, UP, UP],
      [DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN],
      [UP, UP, UP, DOWN, DOWN, DOWN, NEUTRAL],
    ] as const
    for (const [index, ballots] of ballotsByPost.entries()) {
      const post = await createTestPost()
      const subject = { postId: post.id, rssFeedItemId: null } as const
      await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(index), subject })
      await recordHumanTopicVotes(
        subject,
        fixture.topicId,
        ballots,
        voters.slice(index * 7, index * 7 + 7),
      )
    }

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      {
        classifier_vote: 1,
        decisions: 3,
        human_decisions: 3,
        human_voters: 21,
        human: { up: 1, down: 1, neutral: 1 },
      },
    ])
  })

  it('shows a disagreement in the cell of the vote the classifier cast', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.1, at: seedMoment(0) })
    await recordHumanTopicVotes(subject, fixture.topicId, Array<1>(20).fill(UP))

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { classifier_vote: -1, human_voters: 20, human: { up: 1, down: 0, neutral: 0 } },
    ])
  })

  it('never counts a platform account as a human voter', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    const { relationId } = await recordHumanTopicVotes(
      subject,
      fixture.topicId,
      NETS_UP_WITH_TWENTY,
    )
    // Counted as a human, this ballot would bring the net from one up vote to a tie.
    await recordSystemTopicVote(subject, relationId, DOWN)

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { human_decisions: 1, human_voters: 20, human: { up: 1, down: 0, neutral: 0 } },
    ])
  })

  it('counts no human vote when only platform accounts and cleared ballots remain', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    const { relationId, voters } = await recordHumanTopicVotes(subject, fixture.topicId, [UP])
    await recordSystemTopicVote(subject, relationId, UP)
    await recordClearedTopicBallot(subject, relationId, voters[0]!.id)

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { decisions: 1, human_decisions: 0, human_voters: 0, human: null },
    ])
  })

  it('ignores a ballot the voter has since cleared', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    const ballots = [...Array<1>(11).fill(UP), ...Array<-1>(10).fill(DOWN)]
    const { relationId, voters } = await recordHumanTopicVotes(subject, fixture.topicId, ballots)
    // 11 up and 10 down net up; without the clear this would still be reported as up.
    await recordClearedTopicBallot(subject, relationId, voters[1]!.id)

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { human_voters: 20, human: { up: 0, down: 0, neutral: 1 } },
    ])
  })

  it('counts a voter once, through their latest ballot', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    // The first voter tagged the subject (an up vote) and then changed their ballot to down. Summing
    // every ballot ever cast would net one up vote instead of the tie of the latest ballots.
    const ballots: Ballot[] = [DOWN, ...Array<1>(10).fill(UP), ...Array<-1>(9).fill(DOWN)]
    await recordHumanTopicVotes(subject, fixture.topicId, ballots)

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { human_voters: 20, human: { up: 0, down: 0, neutral: 1 } },
    ])
  })
})

describe('getClassifierHumanVoteComparison cohort suppression', () => {
  it('withholds the human breakdown until twenty distinct humans voted', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    const { relationId } = await recordHumanTopicVotes(
      subject,
      fixture.topicId,
      Array<1>(19).fill(UP),
    )

    const below = await reportOf(fixture)
    const [twentieth] = await createHumanVoters(1)
    await castHumanTopicRelationVote(twentieth!.id, subject, relationId, UP)
    const reached = await reportOf(fixture)

    expect(below.cells).toMatchObject([
      { decisions: 1, human_decisions: 1, human_voters: 19, human: null },
    ])
    expect(reached.cells).toMatchObject([
      { human_voters: 20, human: { up: 1, down: 0, neutral: 0 } },
    ])
  })

  it('does not let one voter pass as a cohort by repeating across re-classifications', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await recordHumanTopicVotes(subject, fixture.topicId, [DOWN])
    for (let index = 0; index < 25; index++) {
      await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(index / 100) })
    }

    const comparison = await reportOf(fixture)

    expect(comparison.cells).toMatchObject([
      { decisions: 25, human_decisions: 25, human_voters: 1, human: null },
    ])
  })

  it('exposes no voter, ballot, subject or topic identity', async () => {
    const fixture = await activatedFixture()
    const subject = postSubject(fixture)
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(0) })
    const { relationId, voters } = await recordHumanTopicVotes(
      subject,
      fixture.topicId,
      Array<1>(20).fill(UP),
    )

    const comparison = await reportOf(fixture)

    const serialized = JSON.stringify(comparison)
    for (const identity of [
      relationId,
      fixture.postId,
      fixture.topicId,
      fixture.communityId,
      ...voters.map(voter => voter.id),
    ]) {
      expect(serialized).not.toContain(identity)
    }
    expect(Object.keys(comparison).toSorted()).toEqual([
      'batches_examined',
      'cells',
      'classifier_id',
      'community_id',
      'min_human_cohort',
      'post_id',
      'rss_feed_item_id',
      'truncated',
      'window',
    ])
    expect(Object.keys(comparison.cells[0]!).toSorted()).toEqual([
      'classifier_vote',
      'decisions',
      'effective_lower_threshold',
      'effective_upper_threshold',
      'human',
      'human_decisions',
      'human_voters',
      'mean_probability',
      'probability_lower',
      'probability_upper',
    ])
    expect(Object.keys(comparison.cells[0]!.human!).toSorted()).toEqual(['down', 'neutral', 'up'])
  })
})
