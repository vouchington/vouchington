import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import * as setup from '../../data-stores/psql/setup.mts'
import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { guardAndRetireMonthlyPartition } from '../../data-stores/psql/migration-runner/guard-and-retire-monthly-partition.mts'
import { PARTITION_DROP_POLICIES } from '../../data-stores/psql/config-driven/utils/partition-drop-policies.mts'
import type { PartitionDropCandidate } from '../../data-stores/psql/migration-runner/partition-drop-guard.mts'
import { withTestOwnedPostgresWait } from '../postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'
import { rejectQuery } from '../injected-failures.mts'
import { vi } from 'vitest'
import sql from 'sql-template-strings'

const policy = PARTITION_DROP_POLICIES.ai_usage_records

/** Inject a catalog/creator fault at the owned transaction boundary without changing shared DDL. */
export async function withTestAiUsagePreparationFault(
  partition: string,
  fault: 'creator' | 'present-unattached',
  operation: () => Promise<void>,
): Promise<void> {
  let probeMatched = false
  let faultMatched = false
  const realWrite = setup.write
  const writeSpy = vi
    .spyOn(setup, 'write')
    .mockImplementation(
      (
        input: Parameters<typeof realWrite>[0],
        valuesOrOptions?: Parameters<typeof realWrite>[1],
        options?: Parameters<typeof realWrite>[2],
      ) => {
        const statement = typeof input === 'string' ? input : input.text
        const values =
          typeof input === 'string'
            ? Array.isArray(valuesOrOptions)
              ? valuesOrOptions
              : []
            : (input.values ?? [])
        if (
          !probeMatched &&
          statement.includes('/* isAiUsageMonthAttached */') &&
          values.includes(partition)
        ) {
          probeMatched = true
          return Promise.resolve({
            command: 'SELECT',
            rowCount: 1,
            oid: 0,
            fields: [],
            rows: [{ attached: false, present: fault === 'present-unattached' }],
          })
        }
        return realWrite(input, valuesOrOptions, options)
      },
    )
  const realBegin = setup.beginTransaction
  const beginSpy = vi.spyOn(setup, 'beginTransaction').mockImplementation(async options => {
    const transaction = await realBegin(options)
    if (fault === 'creator') {
      return rejectQuery(
        transaction,
        statement => {
          const matches =
            statement.includes('/* createMonthlyPartitions */') && statement.includes(partition)
          if (matches) faultMatched = true
          return matches
        },
        'Injected AI usage partition creator failure',
      )
    }
    return new Proxy(transaction, {
      async apply(target, thisArgument, argumentsList) {
        const [input] = argumentsList
        const statement = typeof input === 'string' ? input : input.text
        const values = typeof input === 'string' ? [] : (input.values ?? [])
        if (statement.includes('/* createMonthlyPartitions */') && statement.includes(partition)) {
          faultMatched = true
          return { command: 'CREATE', rowCount: 0, oid: 0, fields: [], rows: [] }
        }
        const result = await Reflect.apply(target, thisArgument, argumentsList)
        if (!statement.includes('/* isAiUsageMonthAttached */') || !values.includes(partition))
          return result
        return {
          ...result,
          rows: [{ attached: false, present: true }],
          rowCount: 1,
        }
      },
    })
  })
  try {
    await operation()
  } finally {
    beginSpy.mockRestore()
    writeSpy.mockRestore()
  }
  if (!probeMatched || !faultMatched)
    throw new Error('AI usage preparation fault did not reach its owned query boundary')
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
