import { write } from '@data-stores/psql'
import { getElapsedMembershipUserIdsBatch } from '@services/memberships/grants/expire-elapsed-batch'
import { dispatchDuePauseCollectionWork } from '@services/memberships/pause-collection/dispatch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runMembershipWorkSelectionScenarios(): Promise<void> {
  await write(
    `/* seedExplainMembershipExpiry */ UPDATE memberships
     SET expires_at = NOW() - INTERVAL '1 day'
     WHERE id >= $1::uuid AND id < $2::uuid`,
    [seedUuid(0, '31'), seedUuid(100, '31')],
  )
  try {
    await write(`/* seedExplainMembershipExpiry:analyze */ ANALYZE memberships`)
    registerScenarioContract('membership-grant-expiry-candidates', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_memberships__expires_at'] },
        { kind: 'maxProcessedRows', relation: 'memberships', max: 12 },
      ],
      seededRows: { memberships: 300, membership_sources: 300, users: 20_000 },
    })
    await runAndCapture(
      'membership-grant-expiry-candidates',
      () => getElapsedMembershipUserIdsBatch(10),
      undefined,
      'expireElapsedMembershipsBatch: candidates',
    )
  } finally {
    await write(
      `/* seedExplainMembershipExpiry:reset */ UPDATE memberships SET expires_at = NULL
       WHERE id >= $1::uuid AND id < $2::uuid`,
      [seedUuid(0, '31'), seedUuid(100, '31')],
    )
  }

  const lowerUserId = seedUuid(1000, '01')
  const upperUserId = seedUuid(4000, '01')
  try {
    await resetPauseCollectionWork(lowerUserId, upperUserId)
    await write(
      `/* seedExplainPauseCollectionWork:analyze */ ANALYZE membership_pause_collection_work_items`,
    )
    registerScenarioContract('membership-pause-collection-due', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_membership_pause_collection_work_items__lease_expiry',
            'idx_membership_pause_collection_work_items__available',
          ],
          anyOf: true,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'membership_pause_collection_work_items',
          max: 3_100,
        },
      ],
      seededRows: { membership_pause_collection_work_items: 3000 },
    })
    await runAndCapture(
      'membership-pause-collection-due',
      () => dispatchDuePauseCollectionWork(20),
      undefined,
      ['claimExpiredPauseCollection', 'claimUnleasedPauseCollection'],
      { afterCapture: () => resetPauseCollectionWork(lowerUserId, upperUserId) },
    )
  } finally {
    await write(
      `/* seedExplainPauseCollectionWork:remove */
       DELETE FROM membership_pause_collection_work_items
       WHERE user_id >= $1::uuid AND user_id < $2::uuid`,
      [lowerUserId, upperUserId],
    )
  }
}

async function resetPauseCollectionWork(lowerUserId: string, upperUserId: string): Promise<void> {
  await write(
    `/* resetExplainPauseCollectionWork */
    DELETE FROM membership_pause_collection_work_items
    WHERE user_id >= $1::uuid AND user_id < $2::uuid`,
    [lowerUserId, upperUserId],
  )
  await write(
    `/* seedExplainPauseCollectionWork */
     INSERT INTO membership_pause_collection_work_items
       (user_id, requested_at, available_at, lease_token, leased_at, lease_expires_at)
     SELECT id, NOW() - INTERVAL '2 days',
       CASE WHEN ordinal <= 1000 THEN NOW() - INTERVAL '1 day'
            WHEN ordinal <= 2000 THEN NOW() - INTERVAL '2 days'
            ELSE NOW() + INTERVAL '1 day' END,
       CASE WHEN ordinal > 1000 AND ordinal <= 2000 THEN uuidv7() END,
       CASE WHEN ordinal > 1000 AND ordinal <= 2000 THEN NOW() - INTERVAL '2 days' END,
       CASE WHEN ordinal > 1000 AND ordinal <= 2000 THEN NOW() - INTERVAL '1 day' END
     FROM (SELECT id, row_number() OVER (ORDER BY id) AS ordinal
       FROM users WHERE id >= $1::uuid AND id < $2::uuid ORDER BY id) candidates`,
    [lowerUserId, upperUserId],
  )
}
