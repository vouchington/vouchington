import { beginTransaction, write } from '@data-stores/psql'
import {
  activateOrphanedQueuedGrant,
  readOrphanedQueuedGrantUserIds,
} from '@services/memberships/grants/repair-orphaned-queued'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  ORPHANED_QUEUED_GRANT_COUNT,
  ORPHANED_QUEUED_GRANT_NOISE_COUNT,
  readOrphanedQueuedGrantProductId,
  seedOrphanedQueuedGrantFixture,
  seedUnmatchedQueuedGrantTail,
} from '../seed-data/membership-orphaned-queued-grants.mts'

const PAGE_SIZE = 10

export async function runMembershipOrphanedQueuedGrantScenarios(): Promise<void> {
  const orphanUserIds = Array.from({ length: ORPHANED_QUEUED_GRANT_COUNT }, (_, index) =>
    seedUuid(10_000 + index, '01'),
  )
  const noiseUserId = seedUuid(15_000, '01')
  const cursor = seedUuid(9_999, '01')
  const seededRows = {
    membership_grants: ORPHANED_QUEUED_GRANT_COUNT + ORPHANED_QUEUED_GRANT_NOISE_COUNT,
    membership_sources: ORPHANED_QUEUED_GRANT_COUNT * 2 + ORPHANED_QUEUED_GRANT_NOISE_COUNT,
    membership_source_states: ORPHANED_QUEUED_GRANT_COUNT * 2 + ORPHANED_QUEUED_GRANT_NOISE_COUNT,
    memberships: ORPHANED_QUEUED_GRANT_COUNT,
  }
  // Grants cannot be deleted. This scenario is last, so the fixture stays in the discarded
  // explain database.
  const productId = await readOrphanedQueuedGrantProductId()
  await seedOrphanedQueuedGrantFixture(orphanUserIds, productId)
  await seedUnmatchedQueuedGrantTail(noiseUserId, productId)
  await write(
    `/* analyzeOrphanedQueuedGrantFixture */ ANALYZE membership_grants, membership_sources, membership_source_states, memberships, membership_grant_activation_periods`,
  )
  registerScenarioContract('membership-orphaned-queued-grant-candidates', {
    forbidSequentialScans: [
      'membership_grants',
      'membership_source_states',
      'memberships',
      'membership_grant_activation_periods',
    ],
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_grants__user_id'] },
      { kind: 'usesIndexes', indexes: ['idx_memberships__effective_user'] },
      { kind: 'usesIndexes', indexes: ['membership_source_states_pkey'] },
      {
        kind: 'usesIndexes',
        anyOf: true,
        indexes: [
          'idx_membership_grant_activation_periods__open_user',
          'idx_membership_grant_activation_periods__open_grant',
        ],
      },
      // The user index stops after this many inspected grant rows.
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: PAGE_SIZE },
      // The generic plan reads one extra current-membership index probe beyond the page.
      { kind: 'maxProcessedRows', relation: 'memberships', max: PAGE_SIZE + 1 },
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: PAGE_SIZE },
      { kind: 'maxProcessedRows', relation: 'membership_grant_activation_periods', max: PAGE_SIZE },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_membership_grant_remaining_duration',
        // The custom plan can count the duration check twice for each inspected grant row.
        max: PAGE_SIZE * 2,
      },
    ],
  })
  await runAndCapture(
    'membership-orphaned-queued-grant-candidates',
    async () => {
      await using transaction = await beginTransaction()
      await readOrphanedQueuedGrantUserIds(cursor, PAGE_SIZE, transaction)
    },
    undefined,
    'repairOrphanedQueuedGrantsBatch: candidates',
  )
  registerScenarioContract('membership-orphaned-queued-grant-nil-cursor', {
    forbidSequentialScans: [
      'membership_grants',
      'membership_source_states',
      'memberships',
      'membership_grant_activation_periods',
    ],
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_grants__user_id'] },
      { kind: 'usesIndexes', indexes: ['idx_memberships__effective_user'] },
      { kind: 'usesIndexes', indexes: ['membership_source_states_pkey'] },
      {
        kind: 'usesIndexes',
        anyOf: true,
        indexes: [
          'idx_membership_grant_activation_periods__open_user',
          'idx_membership_grant_activation_periods__open_grant',
        ],
      },
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: PAGE_SIZE },
      { kind: 'maxProcessedRows', relation: 'memberships', max: PAGE_SIZE + 1 },
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: PAGE_SIZE },
      { kind: 'maxProcessedRows', relation: 'membership_grant_activation_periods', max: PAGE_SIZE },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_membership_grant_remaining_duration',
        max: PAGE_SIZE * 2,
      },
    ],
  })
  await runAndCapture(
    'membership-orphaned-queued-grant-nil-cursor',
    async () => {
      await using transaction = await beginTransaction()
      await readOrphanedQueuedGrantUserIds(null, PAGE_SIZE, transaction)
    },
    undefined,
    'repairOrphanedQueuedGrantsBatch: candidates',
  )
  registerScenarioContract('membership-orphaned-queued-grant-activation', {
    forbidSequentialScans: [
      'membership_grants',
      'memberships',
      'membership_source_states',
      'membership_grant_activation_periods',
    ],
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_grants__user_id'] },
      { kind: 'usesIndexes', indexes: ['idx_memberships__effective_user'] },
      { kind: 'usesIndexes', indexes: ['membership_source_states_pkey'] },
      // The custom plan counts the index probe and the duration filter for the one grant.
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: 2 },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 4 },
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 3 },
      { kind: 'maxProcessedRows', relation: 'membership_grant_activation_periods', max: 1 },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_membership_grant_remaining_duration',
        // The statement projects the duration and filters on it; the custom plan evaluates one extra call.
        max: 3,
      },
    ],
  })
  await runAndCapture(
    'membership-orphaned-queued-grant-activation',
    async () => {
      await using transaction = await beginTransaction()
      await activateOrphanedQueuedGrant(orphanUserIds[0]!, transaction)
    },
    undefined,
    'repairOrphanedQueuedGrant',
  )
}
