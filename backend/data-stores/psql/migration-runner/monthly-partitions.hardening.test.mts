import { describe, expect, it } from 'vitest'
import { buildMonthlyPartitionName } from '@vouchington/postgres/partitions'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import {
  insertTestCommunityReviewChange,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import { createTestPost } from '@voucha/test-helpers/entities/create-test-entities'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  readTestCommunityReviewChild,
  readTestPostClearanceChild,
} from '@voucha/test-helpers/partition-monthly-decision-history'
import { createCopyrightPartitionRetirementRecorder } from '@voucha/test-helpers/partition-retirement-failure'
import { write } from '../setup.mts'
import { COPYRIGHT_HISTORY_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { listTestMonthlyDropCandidates } from '@voucha/test-helpers/monthly-partition-candidates'
import {
  listMonthlyDropCandidates,
  type PartitionCleanupCursor,
} from './monthly-partition-candidates.mts'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  retireMonthlyDropCandidates,
  retireMonthlyPartitionCandidate,
  type PartitionDropOutcome,
} from './monthly-partitions.mts'

type Recorder = ReturnType<typeof createCopyrightPartitionRetirementRecorder>

async function sweepRecorded(
  recorder: Recorder,
  referenceDate: Date,
): Promise<PartitionDropOutcome[]> {
  const { candidates } = await listMonthlyDropCandidates(recorder.query)
  return retireMonthlyDropCandidates(candidates, referenceDate, 500, candidate =>
    retireMonthlyPartitionCandidate(candidate, referenceDate, 500, recorder.begin),
  )
}

describe('monthly decision history lifecycle', () => {
  it('routes bootstrap writes to both monthly children and can create later children', async () => {
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: author.id })
    const post = await createTestPost({ user: author, community_id: community.id })
    await setTestPostClearanceStatus(post.id, 'approved')
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId: post.id })
    await insertTestCommunityReviewChange({
      communityId: community.id,
      postId: post.id,
      changedById: author.id,
    })
    const current = new Date()
    const currentMonth = (table: string) =>
      buildMonthlyPartitionName(table, current.getUTCFullYear(), current.getUTCMonth() + 1)
    expect(await readTestPostClearanceChild(post.id)).toBe(currentMonth('post_clearance_changes'))
    expect(await readTestCommunityReviewChild(post.id)).toBe(
      currentMonth('community_post_review_changes'),
    )
    await expect(createMonthlyPartitions(write)).resolves.toBeUndefined()
  })

  it('routes both histories through guarded retirement only beyond 72 calendar months', async () => {
    const tables = ['post_clearance_changes', 'community_post_review_changes']
    const recorder = createCopyrightPartitionRetirementRecorder(tables, ['1995_03', '2003_05'])
    const outcomes = await sweepRecorded(recorder, new Date('2006-02-15T00:00:00.000Z'))
    for (const table of tables) {
      expect(outcomes).toContainEqual({
        table,
        partition: `${table}__p_1995_03`,
        outcome: 'dropped',
      })
      expect(outcomes).toContainEqual({
        table,
        partition: `${table}__p_2003_05`,
        outcome: 'refused',
        reason: 'inside-retention',
      })
    }
    expect(
      recorder.statements.filter(statement => statement.includes('retireMonthlyPartition:drop')),
    ).toHaveLength(tables.length)
    expect(
      recorder.statements.filter(statement => statement.includes('lockCandidate')),
    ).toHaveLength(tables.length)
    const lockOrder = recorder.statements.flatMap(
      statement =>
        /cleanupPartitions:(lockReference|lockParent|lockCandidate)/.exec(statement)?.slice(1) ??
        [],
    )
    expect(lockOrder).toEqual(
      tables.flatMap(() => ['lockReference', 'lockParent', 'lockCandidate']),
    )
    expect(
      recorder.statements.filter(
        statement =>
          /lock(Reference|Parent|Candidate) \*\//.test(statement) && !statement.endsWith(' NOWAIT'),
      ),
    ).toEqual([])
  })
})

describe('copyright monthly partition retirement', () => {
  it('discovers bootstrapped copyright monthly children and preserves all ten inside six years', async () => {
    const tables = COPYRIGHT_HISTORY_PARTITION_TABLES.map(config => config.table)
    const candidates = await listTestMonthlyDropCandidates(write)
    const copyright = candidates.filter(candidate => tables.includes(candidate.table))
    expect(new Set(copyright.map(candidate => candidate.table))).toEqual(new Set(tables))
    expect(copyright.every(candidate => candidate.upperBound instanceof Date)).toBe(true)

    const outcomes: PartitionDropOutcome[] = []
    let after: PartitionCleanupCursor | undefined
    let finished = false
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await cleanupPartitions(new Date('1900-01-01T00:00:00.000Z'), {
        feedbackBatchSize: 500,
        limit: 50,
        after,
      })
      outcomes.push(...page.outcomes)
      if (!page.hasMore) {
        finished = true
        break
      }
      after = page.nextCursor
      if (!after) throw new Error('Monthly cleanup page has no continuation cursor')
    }
    expect(finished).toBe(true)
    const copyrightOutcomes = outcomes.filter(outcome => tables.includes(outcome.table))
    expect(copyrightOutcomes).toHaveLength(copyright.length)
    expect(copyrightOutcomes.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
  })

  it('routes all ten copyright children through guarded cleanup only at 72 calendar months', async () => {
    const tables = COPYRIGHT_HISTORY_PARTITION_TABLES.map(config => config.table)
    const before = createCopyrightPartitionRetirementRecorder(tables)
    const refusals = await sweepRecorded(before, new Date('2026-02-28T23:59:59.999Z'))
    expect(refusals).toHaveLength(tables.length)
    expect(refusals.every(outcome => outcome.reason === 'inside-retention')).toBe(true)
    expect(
      before.statements.some(statement => statement.includes('retireMonthlyPartition:drop')),
    ).toBe(false)

    const boundary = createCopyrightPartitionRetirementRecorder(tables)
    const routed = await sweepRecorded(boundary, new Date('2026-03-01T00:00:00.000Z'))
    expect(routed).toHaveLength(tables.length)
    expect(routed.every(outcome => outcome.outcome === 'dropped')).toBe(true)
    const holdLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockHolds') ? [index] : [],
    )
    const holdChecks = boundary.statements.flatMap((statement, index) =>
      statement.includes('getPartitionDropRefusal:copyrightLegalHold') ? [index] : [],
    )
    const partyLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockCopyrightParties') ? [index] : [],
    )
    const parentLocks = boundary.statements.flatMap((statement, index) =>
      statement.includes('cleanupPartitions:lockParent') ? [index] : [],
    )
    expect(partyLocks).toHaveLength(tables.length)
    expect(partyLocks.every((index, position) => index < parentLocks[position]!)).toBe(true)
    expect(holdLocks).toHaveLength(tables.length)
    expect(holdChecks).toHaveLength(tables.length)
    expect(holdLocks.every((index, position) => index < holdChecks[position]!)).toBe(true)
    const reportProbes = boundary.statements.filter(statement =>
      statement.includes('/* copyrightHistoryReportIsCovered */'),
    )
    const reportRetirements = boundary.statements.filter(statement =>
      statement.includes('/* recordCopyrightHistoryReportSourceRetirement */'),
    )
    expect(reportProbes).toHaveLength(2)
    expect(reportRetirements).toHaveLength(2)
    expect(
      boundary.statements.filter(statement => statement.includes('retireMonthlyPartition:detach')),
    ).toHaveLength(tables.length)
    expect(
      boundary.statements.filter(statement => statement.includes('retireMonthlyPartition:drop')),
    ).toHaveLength(tables.length)
  })
})
