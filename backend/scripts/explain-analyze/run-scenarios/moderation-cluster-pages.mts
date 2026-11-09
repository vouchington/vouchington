import assert from 'node:assert/strict'
import { selectEntityClusterRows } from '@services/moderation-reports/clustered-query'
import type { ClusterRow } from '@services/moderation-reports/clustered-types'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { REPORT_CONTEXT_SEED_ROW_COUNT } from '../seed-data/moderation-report-context-counts.mts'
import {
  clusterFixturePostIds,
  MODERATION_CLUSTER_REPORT_COUNT,
  MODERATION_CLUSTER_HOT_POST_ID,
  type ClusterFixtureStatus,
} from '../seed-data/moderation-cluster-pages.mts'

const STATUSES: readonly ClusterFixtureStatus[] = ['pending', 'reviewed', 'actioned', 'dismissed']
const PAGE_LIMIT = 4

/** Captures full and continued pages, including tied timestamps and dense sibling reports. */
export async function runModerationClusterPageScenarios(): Promise<void> {
  for (const status of STATUSES) {
    for (const sortAsc of [true, false]) {
      const sortName = sortAsc ? 'asc' : 'desc'
      const fixtureIds = clusterFixturePostIds(sortAsc ? 0 : 1)
      const orderedIds = sortAsc ? fixtureIds : fixtureIds.toReversed()
      const firstRows = await capturePage(
        `moderation-clusters-${status}-${sortName}-first`,
        status,
        sortAsc,
        null,
        'after',
        orderedIds.slice(0, PAGE_LIMIT + 1),
      )
      if (status !== 'pending') continue
      const afterRow = firstRows[PAGE_LIMIT - 1]!
      await capturePage(
        `moderation-clusters-${status}-${sortName}-after`,
        status,
        sortAsc,
        cursorFromRow(afterRow),
        'after',
        orderedIds.slice(PAGE_LIMIT, PAGE_LIMIT * 2 + 1),
      )
      const beforeRow = firstRows[PAGE_LIMIT]!
      await capturePage(
        `moderation-clusters-${status}-${sortName}-before`,
        status,
        sortAsc,
        cursorFromRow(beforeRow),
        'before',
        orderedIds.slice(0, PAGE_LIMIT).toReversed(),
      )
    }
  }
  await capturePage(
    'moderation-clusters-pending-hot',
    'pending',
    false,
    {
      createdAt: '2150-01-01T00:00:00.000000Z',
      id: MODERATION_CLUSTER_HOT_POST_ID,
      entityType: 'post',
    },
    'after',
    [MODERATION_CLUSTER_HOT_POST_ID, ...clusterFixturePostIds(0).toReversed().slice(0, PAGE_LIMIT)],
    [10_000, 16, 16, 16, 16],
  )
}

type ClusterCursor = { createdAt: string; entityType: string; id: string }

function cursorFromRow(row: ClusterRow): ClusterCursor {
  return { createdAt: row.cursor_created_at, entityType: row.entity_type, id: row.entity_id }
}

async function capturePage(
  scenarioId: string,
  status: ModerationReportStatus,
  sortAsc: boolean,
  beforeCursor: ClusterCursor | null,
  cursorDirection: 'after' | 'before',
  expectedIds: string[],
  expectedCounts = expectedIds.map(() => 16),
): Promise<ClusterRow[]> {
  registerScenarioContract(scenarioId, {
    seededRows: {
      moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT + MODERATION_CLUSTER_REPORT_COUNT,
    },
    expectations: [{ kind: 'queryBinds', token: 'LIMIT' }],
  })
  let capturedRows: ClusterRow[] = []
  await runAndCapture(
    scenarioId,
    async () => {
      const rows = await selectEntityClusterRows({
        limit: PAGE_LIMIT,
        status,
        sortAsc,
        beforeCursor,
        cursorDirection,
      })
      assert.deepEqual(
        rows.map(row => row.entity_id),
        expectedIds,
      )
      assert.deepEqual(
        rows.map(row => row.report_count),
        expectedCounts,
      )
      capturedRows = rows
    },
    undefined,
    'listClusteredModerationReports:clusters',
  )
  return capturedRows
}
