import { describe, expect, it } from 'vitest'
import { PARTITION_DROP_POLICIES } from '../config-driven/utils/partition-drop-policies.mts'
import type { QueryExecutor } from '../types.mts'
import { guardAndRetireMonthlyPartition } from './guard-and-retire-monthly-partition.mts'

const now = new Date('2026-10-23T00:00:00.000Z')
const candidate = {
  table: 'ai_usage_records',
  partition: 'ai_usage_records__p_2025_01',
  upperBound: new Date('2025-02-01T00:00:00.000Z'),
}

function recordingTransaction(options: { nonEmpty: boolean }) {
  const statements: string[] = []
  const transaction = (async (statement: string) => {
    statements.push(statement)
    return { rows: statement.includes('probeNonEmpty') && options.nonEmpty ? [{ x: 1 }] : [] }
  }) as unknown as QueryExecutor
  return { statements, transaction }
}

const tags = (statements: string[]) =>
  statements.map(statement => statement.match(/\/\* ([^*]+) \*\//)?.[1])

describe('AI usage partition retirement locking', () => {
  const policy = PARTITION_DROP_POLICIES.ai_usage_records

  it('probes a non-empty child without taking any lock', async () => {
    const { statements, transaction } = recordingTransaction({ nonEmpty: true })

    await expect(
      guardAndRetireMonthlyPartition(transaction, candidate, policy, now, 1),
    ).resolves.toBe('in-flight')

    expect(tags(statements)).toEqual(['cleanupPartitions:probeNonEmpty'])
    expect(statements.some(statement => /LOCK TABLE|SET LOCAL/.test(statement))).toBe(false)
  })

  it('locks referenced tables, then the parent and child, all without waiting', async () => {
    const { statements, transaction } = recordingTransaction({ nonEmpty: false })

    await expect(
      guardAndRetireMonthlyPartition(transaction, candidate, policy, now, 1),
    ).resolves.toBe(null)

    expect(tags(statements).slice(0, 5)).toEqual([
      'cleanupPartitions:probeNonEmpty',
      'cleanupPartitions:lockReference',
      'cleanupPartitions:lockParent',
      'cleanupPartitions:lockCandidate',
      'getPartitionDropRefusal:nonempty',
    ])
    const references = statements.find(statement => statement.includes('lockReference'))!
    for (const table of policy!.retirementReferenceTables!) expect(references).toContain(table)
    const locks = statements.filter(statement => statement.includes('LOCK TABLE'))
    expect(locks.every(statement => statement.includes('NOWAIT'))).toBe(true)
  })
})
