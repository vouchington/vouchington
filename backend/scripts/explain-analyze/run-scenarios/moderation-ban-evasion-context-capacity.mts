import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { attachBanEvasionContext } from '@services/moderation-reports/ban-evasion-context-attach'
import { fetchBanEvasionReports } from '@services/moderation-reports/community-get-helpers'
import type { PendingModerationReport } from '@services/moderation-reports/pending-moderation-report'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'

const SCENARIO = 'moderation-ban-evasion-context-at-cap'
const PAGE_SIZE = 100
const OTHER_COMMUNITY_REPORTS = 20
const STATEMENTS = ['attachBanEvasionContext:report-communities', 'attachBanEvasionContext']

function contextIds(reports: PendingModerationReport[]) {
  return reports.map(report => [
    report.id,
    report.community_ban_evasion?.community_id ?? null,
    report.community_ban_evasion?.source_user_id ?? null,
  ])
}

export async function runModerationBanEvasionContextCapacity(
  communityId: string,
  otherCommunityId: string,
): Promise<void> {
  const [reports, otherReports] = await Promise.all([
    fetchBanEvasionReports(communityId, PAGE_SIZE),
    fetchBanEvasionReports(otherCommunityId, OTHER_COMMUNITY_REPORTS),
  ])
  assert.equal(reports.length, PAGE_SIZE)
  assert.equal(otherReports.length, OTHER_COMMUNITY_REPORTS)
  const dismissed = reports.slice(0, 20)
  const removed = reports.slice(20, 40)
  const inactiveReportIds = new Set([...dismissed, ...removed].map(row => row.id))
  // Keep the already-read page while its membership flags change before sidecar hydration.
  await write(
    `/* seedModerationBanEvasionContextInactiveMembers */
    UPDATE community_members
    SET suspected_ban_evader_dismissed_at = CASE WHEN user_id = ANY($2::uuid[]) THEN CURRENT_TIMESTAMP END,
      suspected_ban_evader_dismissed_by_id = CASE WHEN user_id = ANY($2::uuid[]) THEN $4::uuid END,
      removed_at = CASE WHEN user_id = ANY($3::uuid[]) THEN CURRENT_TIMESTAMP END,
      removed_by_id = CASE WHEN user_id = ANY($3::uuid[]) THEN $4::uuid END
    WHERE community_id = $1 AND (user_id = ANY($2::uuid[]) OR user_id = ANY($3::uuid[]))`,
    [
      communityId,
      dismissed.map(row => row.entity_id),
      removed.map(row => row.entity_id),
      seedUser.id,
    ],
  )

  const staffReports = [...reports.slice(0, PAGE_SIZE - OTHER_COMMUNITY_REPORTS), ...otherReports]
  const otherReportIds = new Set(otherReports.map(row => row.id))
  const expected = (batch: PendingModerationReport[]) =>
    batch.map(row =>
      inactiveReportIds.has(row.id)
        ? [row.id, null, null]
        : [row.id, otherReportIds.has(row.id) ? otherCommunityId : communityId, heavyFollowUser.id],
    )
  registerScenarioContract(SCENARIO, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: PAGE_SIZE },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 120, captureIndex: 1 },
      // The unscoped staff plan scans live flags across the seeded corpus before checking the pairs.
      // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192557353
      { kind: 'maxProcessedRows', relation: 'community_members', max: 10_760, captureIndex: 3 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 840 },
      { kind: 'maxProcessedRows', relation: 'users', max: 840 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: 60 },
    ],
  })
  await runAndCapture(
    SCENARIO,
    async () => {
      assert.deepEqual(
        contextIds(await attachBanEvasionContext(reports, { communityId })),
        expected(reports),
      )
      assert.deepEqual(
        contextIds(
          await attachBanEvasionContext(
            staffReports.map(row => ({ ...row, community_id: communityId })),
          ),
        ),
        expected(staffReports),
      )
    },
    undefined,
    STATEMENTS,
    { exactCapturedNames: [...STATEMENTS, ...STATEMENTS] },
  )
}
