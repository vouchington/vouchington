import assert from 'node:assert/strict'
import {
  listCommunityPendingModerationReports,
  type CommunityPendingModerationReport,
} from '@services/moderation-claims/community-pending-reports'
import type {
  ModerationReportCursor,
  ModerationReportSort,
} from '@services/moderation-reports/sort-sql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import type { seedCommunityPublicationCapacity } from './community-publication-capacity-fixture.mts'

const limit = 100
type Fixture = Awaited<ReturnType<typeof seedCommunityPublicationCapacity>>

export async function runCommunityPendingReportCapacity({
  communityId,
  rankedReportIds,
  timeReportIds,
  seededRows,
}: Fixture) {
  for (const [sort, expected] of [
    ['severity', rankedReportIds],
    ['created_at_desc', timeReportIds],
  ] as const) {
    const scenario = `community-pending-reports-cap-${sort}`
    registerScenarioContract(scenario, {
      // One candidate and one matching pending report per target in this fixture.
      expectations: [{ kind: 'maxProcessedRows', relation: 'moderation_reports', max: 394 }],
      seededRows,
      crossPartition: { posts: 'Reports can target community posts from any month.' },
    })
    let continuation: ModerationReportCursor = null
    await runAndCapture(
      scenario,
      async () => {
        const first = await listCommunityPendingModerationReports({ communityId, limit, sort })
        assertReportPage(first, expected, 0, sort)
        const next = await listCommunityPendingModerationReports({
          communityId,
          limit,
          sort,
          afterCursor: reportCursor(first.reports.at(-1)!),
        })
        assertReportPage(next, expected, limit, sort)
        assert.ok(next.reports.some(row => row.is_system_generated))
        assert.ok(next.reports.some(row => !row.is_system_generated))
        continuation = reportCursor(next.reports.at(-1)!)
      },
      undefined,
      ['listCommunityPendingModerationReports', 'fetchBanEvasionReports'],
      {
        afterCapture: async () => {
          assert.ok(continuation)
          await assertReportPages(communityId, sort, expected, limit * 2, continuation)
          if (sort === 'severity')
            await assertReportPages(communityId, 'most_reported', timeReportIds, 0, null)
        },
      },
    )
  }
}

function reportCursor(row: CommunityPendingModerationReport): ModerationReportCursor {
  return {
    id: row.id,
    severityRank: row.cursor_severity_rank,
    reportCount: row.cursor_report_count,
  }
}

async function assertReportPages(
  communityId: string,
  sort: ModerationReportSort,
  expected: string[],
  start: number,
  initialCursor: ModerationReportCursor,
) {
  let afterCursor = initialCursor
  for (let offset = start; offset < expected.length; offset += limit) {
    const page = await listCommunityPendingModerationReports({
      communityId,
      limit,
      sort,
      afterCursor,
    })
    assertReportPage(page, expected, offset, sort)
    afterCursor = reportCursor(page.reports.at(-1)!)
  }
}

function assertReportPage(
  page: Awaited<ReturnType<typeof listCommunityPendingModerationReports>>,
  expected: string[],
  offset: number,
  sort: ModerationReportSort,
) {
  assert.deepEqual(
    page.reports.map(row => row.id),
    expected.slice(offset, offset + limit),
    `${sort} reports at offset ${offset}`,
  )
  assert.equal(page.hasNextPage, offset + limit < expected.length)
}
