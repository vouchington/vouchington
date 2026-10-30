import { beginTransaction } from '@data-stores/psql'
import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { guardAndRetireMonthlyPartition } from '../../data-stores/psql/migration-runner/guard-and-retire-monthly-partition.mts'
import { PARTITION_DROP_POLICIES } from '../../data-stores/psql/config-driven/utils/partition-drop-policies.mts'
import type { PartitionDropCandidate } from '../../data-stores/psql/migration-runner/partition-drop-guard.mts'
import sql from 'sql-template-strings'

const policy = PARTITION_DROP_POLICIES.ai_usage_records

/**
 * Retire an owned child through the real guard, but wait for its table locks first. The guard
 * fails fast (NOWAIT) on the shared referenced tables so production never queues behind a writer;
 * any other connection reading them for a moment (another fork's hook, autovacuum) would make a
 * teardown or setup that must succeed fail with lock-contention. The blocking LOCK is bounded by
 * the test statement timeout, and the guard's own NOWAIT locks are then already held.
 */
export async function retireTestAiUsagePartition(candidate: PartitionDropCandidate): Promise<void> {
  const tables = [
    ...(policy?.retirementReferenceTables ?? []),
    candidate.table,
    candidate.partition,
  ]
    .map(table => assertSafeSqlIdentifier(table))
    .join(', ')
  await using transaction = await beginTransaction()
  await transaction(
    `/* retireTestAiUsagePartition:lock */ LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE`,
  )
  const refusal = await guardAndRetireMonthlyPartition(
    transaction,
    candidate,
    policy,
    new Date('9999-01-01T00:00:00Z'),
    1,
  )
  if (refusal) {
    throw new Error(`Owned AI usage partition ${candidate.partition} was not retired: ${refusal}`)
  }
  await transaction.commit()
}

/** Hold a referenced row while the real retirement guard attempts its NOWAIT fence. */
export async function probeBlockedAiUsageRetirement(
  candidate: PartitionDropCandidate,
  communityId: string | null,
): Promise<string> {
  await using holder = await beginTransaction()
  if (communityId) {
    await holder(sql`/* probeBlockedAiUsageRetirement:holdCommunity */
      SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`)
  } else {
    await holder(sql`/* probeBlockedAiUsageRetirement:holdResponseKeys */
      LOCK TABLE ai_usage_provider_response_keys IN ROW EXCLUSIVE MODE`)
  }
  await using retire = await beginTransaction()
  try {
    await guardAndRetireMonthlyPartition(
      retire,
      candidate,
      PARTITION_DROP_POLICIES.ai_usage_records,
      new Date(),
      1,
    )
    return 'unexpected-retirement'
  } catch (err) {
    return (err as { code?: string }).code ?? 'unknown-error'
  }
}
