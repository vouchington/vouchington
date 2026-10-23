import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import type { QueryExecutor } from '@data-stores/psql/types'
import {
  createTestUser,
  getPostClearanceChanges,
  hasTestRetainedIdentityRoot,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  clearTestClearanceIdentityPointer,
  getTestClearanceProjection,
  seedTestRetiredClearanceProjection,
} from '@voucha/test-helpers/entities/content-history'
import {
  guardAndRetireExplicitHistoryRange,
  type ExplicitHistoryRange,
} from '@data-stores/psql/migration-runner/explicit-range-retirement'
import { getPartitionDropStatusRefusals } from '@data-stores/psql/migration-runner/partition-drop-guard'
import { runRetireHistoryRange } from '@data-stores/psql/retire-history-range'
import { PARTITION_DROP_POLICIES } from '@data-stores/psql/config-driven/utils/partition-config'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

const range: ExplicitHistoryRange = {
  table: 'post_clearance_changes',
  partition: 'post_clearance_changes__history_2023',
  fromId: getMinUUIDv7ForDate(new Date('2023-06-01T00:00:00.000Z')),
  toId: getMinUUIDv7ForDate(new Date('2023-06-01T00:00:00.001Z')),
}
const now = new Date('2026-10-23T00:00:00.000Z')

function catalogQuery(options: { held?: boolean; busy?: boolean; absent?: boolean } = {}) {
  const statements: string[] = []
  const query = (async (statement: string) => {
    statements.push(statement)
    if (options.busy && statement.includes('retireExplicitHistoryRange:lockReferences'))
      throw Object.assign(new Error('busy writer'), { code: '55P03' })
    if (statement.includes('retireExplicitHistoryRange:catalog'))
      return { rows: options.absent ? [] : [{ found: 1 }] }
    if (options.held && statement.includes('getPartitionDropRefusal:legalHoldPost'))
      return { rows: [{ found: 1 }] }
    return { rows: [] }
  }) as unknown as QueryExecutor
  return { query, statements }
}

describe('manual clearance history range retirement', () => {
  it('rejects missing or unapproved operator arguments before opening a range', async () => {
    await expect(runRetireHistoryRange(['post_clearance_changes'])).rejects.toThrow(
      'Usage: retire-history-range',
    )
    await expect(
      runRetireHistoryRange(['posts', range.partition, range.fromId, range.toId]),
    ).rejects.toThrow('Usage: retire-history-range')
  })

  it('rejects unmatched and empty operator ranges through real transactions before DDL', async () => {
    await expect(
      runRetireHistoryRange([range.table, range.partition, range.fromId, range.toId]),
    ).rejects.toThrow('History range retirement refused: catalog-mismatch')
    await expect(
      runRetireHistoryRange([range.table, range.partition, range.fromId, range.fromId]),
    ).rejects.toThrow('History range retirement refused: catalog-mismatch')
  })

  it('checks held post authors in the bounded history-range status probe', async () => {
    const statements: string[] = []
    const partition = range.partition
    const query = (async (statement: string) => {
      statements.push(statement)
      return { rows: [{ partition_name: partition, reason: 'legal-hold' }] }
    }) as unknown as QueryExecutor
    const statuses = await getPartitionDropStatusRefusals(
      query,
      [
        {
          table: range.table,
          partition,
          upperBound: new Date('2023-06-01T00:00:00.001Z'),
        },
      ],
      PARTITION_DROP_POLICIES,
      now,
      1,
    )

    expect(statuses.get(partition)).toBe('legal-hold')
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain(
      `JOIN ${partition} AS candidate_row ON candidate_row.post_id = held_post.id`,
    )
    expect(statements[0]).toContain('held_post.created_by_id = hold.account_user_id')
    expect(statements[0]).toContain('LIMIT 1')
  })

  it('validates the catalog twice and takes the owner and reference locks before detach', async () => {
    const { query, statements } = catalogQuery()
    await expect(guardAndRetireExplicitHistoryRange(query, range, now)).resolves.toBeNull()
    expect(statements.map(statement => /\/\* ([^*]+) \*\//.exec(statement)?.[1])).toEqual([
      'retireExplicitHistoryRange:catalog',
      'retireExplicitHistoryRange:lockLiveOwner',
      'retireExplicitHistoryRange:lockHolds',
      'retireExplicitHistoryRange:lockReferences',
      'retireExplicitHistoryRange:lockParent',
      'retireExplicitHistoryRange:lockChild',
      'retireExplicitHistoryRange:catalog',
      'getPartitionDropRefusal:legalHold',
      'getPartitionDropRefusal:legalHoldPost',
      'retireExplicitHistoryRange:detach',
      'retireExplicitHistoryRange:drop',
    ])
    expect(
      statements.filter(
        statement => statement.includes('LOCK TABLE') && !statement.includes('NOWAIT'),
      ),
    ).toEqual([])
  })

  it('reads the live projection and protects its identity after raw history is gone', async () => {
    const author = await createTestUser()
    const staff = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `retired-clearance-${crypto.randomUUID()}`,
      slug: `retired-clearance-${crypto.randomUUID()}`,
      markdown: 'live clearance survives history retirement',
      createdById: author.id,
      clearanceStatus: 'pending',
    })
    const changeId = await seedTestRetiredClearanceProjection(postId, staff.id)

    expect(await getPostClearanceChanges(postId)).toEqual([])
    expect(await getTestClearanceProjection(postId)).toEqual({
      latest_clearance_change_id: changeId,
      clearance_reason: 'staff_rejected',
      clearance_status: 'rejected',
      clearance_private_note: 'staff-only',
      has_creation_moderation_bypass: true,
    })
    await cleanupRetainedIdentityRoots(1_000, { post_clearance_change: [changeId] })
    expect(await hasTestRetainedIdentityRoot('post_clearance_change', changeId)).toBe(true)
    await clearTestClearanceIdentityPointer(postId)
    await cleanupRetainedIdentityRoots(1_000, { post_clearance_change: [changeId] })
    expect(await hasTestRetainedIdentityRoot('post_clearance_change', changeId)).toBe(false)
  })
  it('refuses an unverified child, a held post author, and a busy reference writer before detach', async () => {
    const absent = catalogQuery({ absent: true })
    await expect(guardAndRetireExplicitHistoryRange(absent.query, range, now)).resolves.toBe(
      'catalog-mismatch',
    )
    expect(absent.statements).toHaveLength(1)

    const held = catalogQuery({ held: true })
    await expect(guardAndRetireExplicitHistoryRange(held.query, range, now)).resolves.toBe(
      'legal-hold',
    )
    expect(held.statements.some(statement => statement.includes('DETACH PARTITION'))).toBe(false)

    const busy = catalogQuery({ busy: true })
    await expect(guardAndRetireExplicitHistoryRange(busy.query, range, now)).rejects.toMatchObject({
      code: '55P03',
    })
    expect(busy.statements.some(statement => statement.includes('DETACH PARTITION'))).toBe(false)
  })
})
