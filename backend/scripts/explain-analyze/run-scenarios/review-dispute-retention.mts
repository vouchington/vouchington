import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import { cleanupReviewDisputeResolutionRuns } from '@services/data-retention/cleanup-ai-rerun-outcomes'
import { getRetentionCutoffDate } from '@services/data-retention/cleanup-options'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

const COHORT_SIZE = 1_000
const PAGE_SIZE = 10
const RELATION = 'review_dispute_resolution_runs'

/** Old terminal dispute runs page by id; a page must not walk the whole old cohort. */
export async function runReviewDisputeRetentionScenario(): Promise<void> {
  const now = new Date('2001-07-01T00:00:00.000Z')
  const oldTimestamp = new Date('2001-03-01T00:00:00.000Z').getTime()
  const ids = Array.from({ length: COHORT_SIZE }, (_, index) =>
    seedUuidAtTimestamp(oldTimestamp, 14_000_000 + index),
  )
  const { rows: topics } = await read<{ id: string }>(
    '/* seedReviewDisputeRetention:topic */ SELECT id FROM topics ORDER BY id LIMIT 1',
  )
  const topicId = topics[0]?.id
  if (!topicId) throw new Error('Review dispute retention EXPLAIN topic was not seeded')
  const { rows: disputes } = await write<{ id: string }>(
    `/* seedReviewDisputeRetention:dispute */
     INSERT INTO review_disputes (post_id, topic_id, disputed_rating, disputant_user_id, reason, claim_text)
     VALUES ($1::uuid, $2::uuid, 3, $3::uuid, 'other', 'EXPLAIN retention fixture')
     RETURNING id`,
    [seedUuid(20, '05'), topicId, seedUuid(5000, '01')],
  )
  const disputeId = disputes[0]?.id
  if (!disputeId) throw new Error('Review dispute retention EXPLAIN dispute was not inserted')
  try {
    await insertRuns(disputeId, ids)
    await write(`/* seedReviewDisputeRetention:analyze */ ANALYZE ${RELATION}`)
    const cutoffId = getMinUuidv7ForDate(getRetentionCutoffDate(90, now))
    const { rows } = await read<{ id: string }>(
      `/* assertReviewDisputeRetentionOwnership */
       SELECT id FROM ${RELATION} WHERE id < $1::uuid ORDER BY id LIMIT ${COHORT_SIZE + 1}`,
      [cutoffId],
    )
    assert.deepEqual(
      rows.map(row => row.id),
      ids.toSorted(),
    )
    registerScenarioContract('review-dispute-rerun-retention', {
      seededRows: { [RELATION]: COHORT_SIZE },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        { kind: 'maxProcessedRows', relation: RELATION, max: 30 },
      ],
      forbidSequentialScans: [RELATION],
    })
    await runAndCapture(
      'review-dispute-rerun-retention',
      async () => {
        const result = await cleanupReviewDisputeResolutionRuns({
          now,
          maxBatches: 1,
          batchSize: PAGE_SIZE,
        })
        assert.deepEqual(result, { deleted: PAGE_SIZE, hasMore: true })
      },
      undefined,
      'deleteOldReviewDisputeResolutionRunBatch',
      { afterCapture: () => insertRuns(disputeId, ids.slice(0, PAGE_SIZE)) },
    )
  } finally {
    await write(
      '/* cleanupReviewDisputeRetention:dispute */ DELETE FROM review_disputes WHERE id = $1::uuid',
      [disputeId],
    )
    await write(`/* cleanupReviewDisputeRetention:vacuum */ VACUUM (ANALYZE) ${RELATION}`)
  }
}

async function insertRuns(disputeId: string, ids: readonly string[]): Promise<void> {
  await write(
    `/* seedReviewDisputeRetention:runs */
     INSERT INTO ${RELATION} (id, review_dispute_id, expired_at)
     SELECT owned.id, $2::uuid, now() FROM unnest($1::uuid[]) AS owned(id)`,
    [ids, disputeId],
  )
}
