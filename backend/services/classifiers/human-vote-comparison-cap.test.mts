import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { classifiersWorkConfig, getClassifiersWorkLimit } from './work-limits.mts'
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
  it('keeps SQL aggregation and truncation metadata on the captured cap across the classifier await', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    await seedGlobalDecision(fixture, { probability: 0.9, at: seedMoment(-2) })
    await insertCompletedEmptyBatches(fixture, 2, seedMoment(0))
    const restore = overrideDynamicConfigFieldsForTest(classifiersWorkConfig, {
      comparison_max_batches: 2,
    })
    try {
      const { result: observed, queries } = await withCapturedTestQueries(() =>
        observeTestPostgresQueryPools(
          '/* classifierHumanVoteComparison:classifier */',
          () => getClassifierHumanVoteComparison({ classifierId: fixture.classifierId, ...WINDOW }),
          () => {
            overrideDynamicConfigFieldsForTest(classifiersWorkConfig, { comparison_max_batches: 1 })
          },
        ),
      )
      expect(observed.result).toMatchObject({
        outcome: 'ok',
        comparison: {
          batches_examined: 2,
          truncated: true,
          cells: [],
        },
      })
      const comparison = queries.find(query =>
        query.text.includes('/* classifierHumanVoteComparison */'),
      )!
      expect(comparison.text).toContain('LIMIT $5')
      expect(comparison.values.slice(3, 5)).toEqual([3, 2])
    } finally {
      restore()
    }
  })

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
