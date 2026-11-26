import assert from 'node:assert/strict'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { deleteChildPage } from '@services/copyright-notices/operational-retention-email-intake-operations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanupCopyrightUnlinkedRecommendations,
  crossMonthReceipt,
  crossMonthRecommendations,
  crossMonthReview,
  enableRecommendationRetention,
  recommendationPageSize,
  recommendationRelation,
  recommendationRetentionSetting,
  reviewRelation,
  seedCopyrightUnlinkedRecommendations,
  targetReceipt,
  targetRecommendations,
  targetReview,
  unrelatedRecommendations,
} from './copyright-unlinked-recommendation-fixture.mts'

const marker = 'deleteUnlinkedCopyrightEmailRecommendations'
const identityRelation = 'copyright_notice_email_intake_recommendation_identities'
const scenario = 'copyright-unlinked-email-recommendation-retention-at-cap'

export async function runCopyrightUnlinkedRecommendationRetentionScenario(): Promise<void> {
  await seedCopyrightUnlinkedRecommendations()
  try {
    await write(`/* analyzeCopyrightUnlinkedRecommendationRetention */
      ANALYZE ${recommendationRelation}, ${identityRelation}, ${reviewRelation}`)
    const { rows } = await write<{ recommendations: number; reviews: number }>(
      `/* countCopyrightUnlinkedRecommendationRetention */
       SELECT (SELECT COUNT(*) FROM ${recommendationRelation})::int AS recommendations,
         (SELECT COUNT(*) FROM ${reviewRelation})::int AS reviews`,
    )
    registerScenarioContract(scenario, {
      allowEmptyResult: true, // DELETE has no RETURNING clause.
      seededRows: {
        [recommendationRelation]: rows[0]!.recommendations,
        [reviewRelation]: rows[0]!.reviews,
      },
      crossPartition: {
        [reviewRelation]:
          'A review can protect an older recommendation. Its UUID has an independent date, so the unchanged eligibility proof searches the retained review partitions.',
      },
      expectations: [
        { kind: 'singleLeaf', parent: recommendationRelation },
        { kind: 'noSeqScan', relation: recommendationRelation },
        // The candidate sort can read all 502 owned fixture rows; deletion visits 500 IDs.
        {
          kind: 'maxProcessedRows',
          relation: recommendationRelation,
          max: recommendationPageSize * 2 + 2,
        },
        { kind: 'maxProcessedRows', relation: identityRelation, max: 2 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: recommendationPageSize * 2 + 2 },
      ],
    })
    await using query = await beginTransaction()
    await query(enableRecommendationRetention)
    await runAndCapture(
      scenario,
      async () => {
        assert.equal(
          await deleteChildPage(
            query,
            targetReceipt,
            recommendationPageSize,
            recommendationRelation,
          ),
          recommendationPageSize,
        )
      },
      undefined,
      marker,
      {
        exactCapturedNames: [marker],
        localSettings: { [recommendationRetentionSetting]: 'on' },
        afterCapture: async () => {
          const reviewed = targetRecommendations[0]!
          await checkSurvivors(query, [reviewed, targetRecommendations.at(-1)!])
          assert.equal(
            await deleteChildPage(
              query,
              targetReceipt,
              recommendationPageSize,
              recommendationRelation,
            ),
            1,
          )
          await checkSurvivors(query, [reviewed])
          assert.equal(
            await deleteChildPage(
              query,
              targetReceipt,
              recommendationPageSize,
              recommendationRelation,
            ),
            0,
          )
          await checkCrossMonthHistory(query)
          await query.rollback()
        },
      },
    )
  } finally {
    await cleanupCopyrightUnlinkedRecommendations()
  }
}

async function checkSurvivors(query: TransactionQuery, expected: string[]): Promise<void> {
  const { rows } = await query<{
    recommendations: string[]
    reviewed_id: string | null
    receipt_decision: string | null
  }>(
    `/* checkCopyrightUnlinkedRecommendationRetention */
     SELECT ARRAY(SELECT id FROM ${recommendationRelation} WHERE id = ANY($1::uuid[]) ORDER BY id) AS recommendations,
       (SELECT copyright_notice_email_intake_recommendation_id FROM ${reviewRelation}
        WHERE id = $2 AND copyright_notice_email_intake_receipt_id = $3) AS reviewed_id,
       (SELECT review_decision FROM copyright_notice_email_intake_receipts WHERE id = $3) AS receipt_decision`,
    [[...targetRecommendations, ...unrelatedRecommendations], targetReview, targetReceipt],
  )
  assert.deepEqual(rows, [
    {
      recommendations: [...expected, ...unrelatedRecommendations],
      reviewed_id: targetRecommendations[0],
      receipt_decision: 'rejected',
    },
  ])
}

async function checkCrossMonthHistory(query: TransactionQuery): Promise<void> {
  assert.equal(await deleteChildPage(query, crossMonthReceipt, 1, recommendationRelation), 1)
  const { rows: continuation } = await query<{ id: string }>(
    `/* checkCopyrightUnlinkedCrossMonthContinuation */
     SELECT id FROM ${recommendationRelation}
     WHERE copyright_notice_email_intake_receipt_id = $1 ORDER BY id`,
    [crossMonthReceipt],
  )
  assert.deepEqual(
    continuation.map(row => row.id),
    [crossMonthRecommendations[0], crossMonthRecommendations[2]],
  )
  assert.equal(await deleteChildPage(query, crossMonthReceipt, 1, recommendationRelation), 1)
  const { rows } = await query<{ id: string; reviewed_id: string }>(
    `/* checkCopyrightUnlinkedCrossMonthSurvivor */
     SELECT recommendation.id, review.copyright_notice_email_intake_recommendation_id AS reviewed_id
     FROM ${recommendationRelation} recommendation
     JOIN ${reviewRelation} review USING (copyright_notice_email_intake_receipt_id)
     WHERE recommendation.copyright_notice_email_intake_receipt_id = $1 AND review.id = $2
     ORDER BY recommendation.id`,
    [crossMonthReceipt, crossMonthReview],
  )
  assert.deepEqual(rows, [
    { id: crossMonthRecommendations[0], reviewed_id: crossMonthRecommendations[0] },
  ])
}
