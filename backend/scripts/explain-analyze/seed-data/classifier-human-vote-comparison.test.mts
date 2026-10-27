import { describe, expect, it } from 'vitest'
import { getClassifierHumanVoteComparison } from '../../../services/classifiers/get-classifier-human-vote-comparison.mts'
import { insertCompletedEmptyBatches } from '../../../test-helpers/data-stores/psql/classifier-comparison-seeding.mts'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import {
  CLASSIFIER_COMPARISON_WINDOW_FROM,
  CLASSIFIER_COMPARISON_WINDOW_TO,
} from './classifier-human-vote-comparison.mts'
import { resolveSeedAnchor } from './seed-anchor.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('classifier human-vote EXPLAIN window', () => {
  it('selects a seeded batch in the pinned, retained window', async () => {
    const anchor = resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs
    expect(CLASSIFIER_COMPARISON_WINDOW_FROM.getTime()).toBe(anchor - 7 * DAY_MS)
    expect(CLASSIFIER_COMPARISON_WINDOW_TO.getTime()).toBe(anchor - 6 * DAY_MS)

    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    await insertCompletedEmptyBatches(
      fixture,
      1,
      new Date(CLASSIFIER_COMPARISON_WINDOW_FROM.getTime() + 1),
    )

    const result = await getClassifierHumanVoteComparison({
      classifierId: fixture.classifierId,
      from: CLASSIFIER_COMPARISON_WINDOW_FROM,
      to: CLASSIFIER_COMPARISON_WINDOW_TO,
    })
    expect(result).toMatchObject({ outcome: 'ok', comparison: { batches_examined: 1 } })
  })
})
