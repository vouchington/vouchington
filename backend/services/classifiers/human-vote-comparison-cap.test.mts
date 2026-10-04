import { getClassifiersWorkLimit } from './work-limits.mts'
import { describe, expect, it } from 'vitest'
import {
  insertCompletedEmptyBatches,
  seedGlobalDecision,
  seedMoment,
} from '../../test-helpers/data-stores/psql/classifier-comparison-seeding.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { getClassifierHumanVoteComparison } from './get-classifier-human-vote-comparison.mts'

const WINDOW = { from: seedMoment(-6), to: seedMoment(6) }

/** The oldest batch of the window is a real decision; `others` newer, empty batches follow it. */
async function reportWithBatches(others: number) {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(-2) })
  await insertCompletedEmptyBatches(fixture, others, seedMoment(0))
  const result = await getClassifierHumanVoteComparison({
    classifierId: fixture.classifierId,
    ...WINDOW,
  })
  if (result.outcome !== 'ok') throw new Error(`expected a report, got ${result.outcome}`)
  return result.comparison
}

describe('getClassifierHumanVoteComparison batch cap', () => {
  it('examines every batch of a window that holds exactly the cap', async () => {
    const comparison = await reportWithBatches(
      getClassifiersWorkLimit('comparison_max_batches') - 1,
    )

    expect(comparison.batches_examined).toBe(getClassifiersWorkLimit('comparison_max_batches'))
    expect(comparison.truncated).toBe(false)
    expect(comparison.cells).toMatchObject([{ probability_lower: 0.9, decisions: 1 }])
  })

  it('examines only the newest batches of a larger window and says so', async () => {
    const comparison = await reportWithBatches(getClassifiersWorkLimit('comparison_max_batches'))

    expect(comparison.batches_examined).toBe(getClassifiersWorkLimit('comparison_max_batches'))
    expect(comparison.truncated).toBe(true)
    // The decision is the oldest batch, so it is the one the cap leaves out.
    expect(comparison.cells).toEqual([])
  })
})
