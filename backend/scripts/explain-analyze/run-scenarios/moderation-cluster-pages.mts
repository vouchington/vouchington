import assert from 'node:assert/strict'
import { selectEntityClusterRows } from '@services/moderation-reports/clustered-query'
import type { ClusterRow } from '@services/moderation-reports/clustered-types'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { REPORT_CONTEXT_SEED_ROW_COUNT } from '../seed-data/moderation-report-context-counts.mts'
import {
  clusterFixturePostIds,
  clusterScalePostIds,
  MODERATION_CLUSTER_REPORT_COUNT,
  MODERATION_CLUSTER_HOT_POST_ID,
  MODERATION_CLUSTER_TIED_USER_ID,
} from '../seed-data/moderation-cluster-pages.mts'

const PAGE_LIMIT = 4

/** Captures full and continued pages, including tied timestamps and dense sibling reports. */
export async function runModerationClusterPageScenarios(): Promise<void> {
  await captureStatusPages('pending')
  await captureStatusPages('reviewed')
  await captureStatusPages('actioned')
  await captureStatusPages('dismissed')
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
    [MODERATION_CLUSTER_HOT_POST_ID, ...clusterScalePostIds().toReversed().slice(0, PAGE_LIMIT)],
    [10_000, 1, 1, 1, 1],
  )
  const ascendingFirstEra = clusterFixturePostIds(0)
  await capturePage(
    'moderation-clusters-pending-same-key-after',
    'pending',
    true,
    {
      createdAt: '1970-01-02T00:00:00.000000Z',
      id: MODERATION_CLUSTER_TIED_USER_ID,
      entityType: 'post',
    },
    'after',
    [MODERATION_CLUSTER_TIED_USER_ID, ascendingFirstEra[11]!],
    [1, 16],
    1,
    ['user', 'post'],
  )
  await capturePage(
    'moderation-clusters-pending-same-key-before',
    'pending',
    true,
    {
      createdAt: '1970-01-02T00:00:00.000000Z',
      id: MODERATION_CLUSTER_TIED_USER_ID,
      entityType: 'user',
    },
    'before',
    ascendingFirstEra.slice(6, 11).toReversed(),
    undefined,
    PAGE_LIMIT,
    ['post', 'post', 'post', 'post', 'post'],
  )
}

async function captureStatusPages(status: ModerationReportStatus): Promise<void> {
  await captureSortPages(status, true)
  await captureSortPages(status, false)
}

async function captureSortPages(status: ModerationReportStatus, sortAsc: boolean): Promise<void> {
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
  if (status !== 'pending') return
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
  pageLimit = PAGE_LIMIT,
  expectedTypes?: string[],
): Promise<ClusterRow[]> {
  registerScenarioContract(scenarioId, {
    seededRows: {
      moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT + MODERATION_CLUSTER_REPORT_COUNT,
    },
    forbidSequentialScans: ['moderation_report_clusters', 'moderation_reports'],
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT' },
      {
        kind: 'usesIndexes',
        indexes: [
          `idx_moderation_report_clusters__${status === 'pending' ? 'pending_' : ''}${sortAsc ? 'first' : 'last'}_reported_at`,
        ],
      },
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_report_clusters',
        // One UUID can name up to four target kinds; the index may read the tie group.
        max: pageLimit + (beforeCursor?.entityType ? 4 : 2),
      },
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_reports',
        max:
          scenarioId === 'moderation-clusters-pending-hot'
            ? 20_100
            : scenarioId === 'moderation-clusters-pending-same-key-after'
              ? 60
              : 180,
      },
    ],
  })
  let capturedRows: ClusterRow[] = []
  await runAndCapture(
    scenarioId,
    async () => {
      const rows = await selectEntityClusterRows({
        limit: pageLimit,
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
      if (expectedTypes)
        assert.deepEqual(
          rows.map(row => row.entity_type),
          expectedTypes,
        )
      capturedRows = rows
    },
    undefined,
    'listClusteredModerationReports:clusters',
  )
  return capturedRows
}
