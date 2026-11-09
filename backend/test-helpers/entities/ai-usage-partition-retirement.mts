import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import {
  assertSafeSqlIdentifier,
  parseMonthlyPartitionName,
  timestampToUuidv7LowerBound,
} from '@vouchington/postgres/partitions'
import { guardAndRetireMonthlyPartition } from '../../data-stores/psql/migration-runner/guard-and-retire-monthly-partition.mts'
import { PARTITION_DROP_POLICIES } from '../../data-stores/psql/config-driven/utils/partition-drop-policies.mts'
import type { PartitionDropCandidate } from '../../data-stores/psql/migration-runner/partition-drop-guard.mts'
import { withTestOwnedPostgresWait } from '../postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'
import sql from 'sql-template-strings'

const policy = PARTITION_DROP_POLICIES.ai_usage_records

/** Keep the owned range attached under another name while preparation tries its canonical name. */
export async function withRenamedTestAiUsagePartition(
  candidate: PartitionDropCandidate,
  action: () => Promise<void>,
): Promise<void> {
  const partition = assertOwnedAiUsagePartitionName(candidate)
  const conflict = assertSafeSqlIdentifier(`${partition}__test_conflict`)
  // no-mistakes-disable-next-line postgres-no-test-state-mutation: the monthly-DDL suite reserves this absent historical child and the retention sweep; only its owned empty partition is renamed and restored in finally to exercise the real DDL failure.
  await write(
    `/* renameTestAiUsagePartition:away */ ALTER TABLE ${partition} RENAME TO ${conflict}`,
  )
  try {
    await action()
  } finally {
    // no-mistakes-disable-next-line postgres-no-test-state-mutation: restore the reserved empty historical child before its owning fixture retires it; no shared application rows or schema objects are changed.
    await write(
      `/* renameTestAiUsagePartition:restore */ ALTER TABLE ${conflict} RENAME TO ${partition}`,
    )
  }
}

/** Keep the owned empty child under its canonical name while it is detached from the parent. */
export async function withDetachedTestAiUsagePartition(
  candidate: PartitionDropCandidate,
  action: () => Promise<void>,
): Promise<void> {
  const partition = assertOwnedAiUsagePartitionName(candidate)
  const parsed = parseMonthlyPartitionName(partition)!
  const lower = timestampToUuidv7LowerBound(Date.UTC(parsed.year, parsed.month - 1, 1))
  const upper = timestampToUuidv7LowerBound(Date.UTC(parsed.year, parsed.month, 1))
  // no-mistakes-disable-next-line postgres-no-test-state-mutation: only the monthly-DDL suite's reserved empty historical child is detached to verify preparation rejects an unattached relation; finally restores its exact range.
  await write(`/* detachTestAiUsagePartition */
    ALTER TABLE ai_usage_records DETACH PARTITION ${partition}`)
  try {
    await action()
  } finally {
    // no-mistakes-disable-next-line postgres-no-test-state-mutation: restore only the reserved historical child's original UUIDv7 bounds before releasing ownership; the fixture contains no shared rows.
    await write(`/* reattachTestAiUsagePartition */
      ALTER TABLE ai_usage_records ATTACH PARTITION ${partition}
      FOR VALUES FROM ('${lower}') TO ('${upper}')`)
  }
}

function assertOwnedAiUsagePartitionName(candidate: PartitionDropCandidate): string {
  if (candidate.table !== 'ai_usage_records') throw new Error('Expected an AI usage partition')
  const partition = assertSafeSqlIdentifier(candidate.partition)
  const parsed = parseMonthlyPartitionName(partition)
  if (parsed?.table !== candidate.table) throw new Error('Expected a monthly AI usage partition')
  return partition
}

/**
 * Retire an owned child through the real guard, but wait for its table locks first. The guard
 * fails fast (NOWAIT) on the shared referenced tables so production never queues behind a writer;
 * any other connection reading them for a moment (another fork's hook, autovacuum) would make a
 * teardown or setup that must succeed fail with lock-contention. The blocking LOCK is bounded by
 * the test statement timeout, and the guard's own NOWAIT locks are then already held.
 */
export async function retireTestAiUsagePartition(candidate: PartitionDropCandidate): Promise<void> {
  await using transaction = await beginTransaction()
  await retireOwnedAiUsagePartitionInTransaction(candidate, transaction)
  await transaction.commit()
}

/** Commit a real empty-child retirement only after the usage writer is queued behind its tier DDL lock. */
export async function retireTestAiUsagePartitionDuringWrite(
  candidate: PartitionDropCandidate,
  writeUsage: () => Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await retireOwnedAiUsagePartitionInTransaction(candidate, transaction)
  const holderProcessId = await getTestPostgresBackendProcessId(transaction)
  await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'relation', name: 'ai_service_tiers', waiterMode: 'RowExclusiveLock' },
      queryMarker: 'registerAiUsageTier',
      releaseHolder: () => transaction[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = writeUsage()
      await waitForLock(pending)
      await transaction.commit()
      await pending
    },
  )
}

async function retireOwnedAiUsagePartitionInTransaction(
  candidate: PartitionDropCandidate,
  transaction: TransactionQuery,
): Promise<void> {
  const tables = [
    ...(policy?.retirementReferenceTables ?? []),
    candidate.table,
    candidate.partition,
  ]
    .map(table => assertSafeSqlIdentifier(table))
    .join(', ')
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
