import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { reportCursorScope } from '@services/moderation-reports/cursor'
import { buildReportPageInfo } from '@services/moderation-reports/pagination'
import { listModerationReportPage } from '@services/moderation-reports/list-page'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const PAGE_SIZE = 100
const SEEDED_REPORTS = 420

export async function runModerationReportListCapacity(): Promise<void> {
  const fixture = await seedReports()
  try {
    await write('/* analyzeModerationReportListCapacity */ ANALYZE moderation_reports')
    const { rows } = await write<{ count: number }>(
      '/* countModerationReportListCorpus */ SELECT count(*)::int AS count FROM moderation_reports',
    )
    const corpusRows = rows[0]!.count
    await captureReportPages('staff', fixture.staffIds, fixture.upperId, corpusRows)
    await captureReportPages('member', fixture.memberIds, fixture.upperId, corpusRows)
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupModerationReportListUsers */
      DELETE FROM users WHERE id = ANY(${fixture.targetIds}::uuid[])`)
    await cleanup.commit()
  }
}

async function captureReportPages(
  audience: 'staff' | 'member',
  expected: string[],
  upperId: string,
  corpusRows: number,
) {
  const scenario = `moderation-reports-${audience}-unclustered-at-cap`
  const name = 'listModerationReports'
  // Main scans the whole relation once per returned SQL row. Tighten in #6555.
  registerScenarioContract(scenario, {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_reports',
        max: (PAGE_SIZE + 1) * corpusRows + (audience === 'staff' ? 127 : 148),
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const ownerId = audience === 'staff' ? null : seedUser.id
      const initialPage = buildReportPageInfo([{ id: upperId }], true, false, {
        sort: 'created_at_desc',
        status: 'pending',
        scope: reportCursorScope(audience, ownerId),
      })
      assert.ok(initialPage.end_cursor)
      let after = initialPage.end_cursor
      for (const offset of [0, PAGE_SIZE]) {
        const args = { limit: PAGE_SIZE, after, sort: 'created_at_desc' as const }
        const page =
          audience === 'staff'
            ? await listModerationReportPage('staff', null, args)
            : await listModerationReportPage('member', seedUser.id, args)
        assert.deepEqual(
          page.results.map(row => row.id),
          expected.slice(offset, offset + PAGE_SIZE),
        )
        assert.equal(page.page_info.has_next_page, true)
        assert.equal(page.page_info.has_previous_page, true)
        assert.ok(page.page_info.end_cursor)
        after = page.page_info.end_cursor
      }
    },
    undefined,
    name,
  )
}

async function seedReports() {
  await using query = await beginTransaction()
  const prefix = `report-capacity-${randomUUID()}`
  const { rows: users } = await query<{ id: string; username: string }>(sql`
    /* seedModerationReportListUsers */
    INSERT INTO users (username)
    SELECT ${prefix} || '-' || n FROM generate_series(1, ${SEEDED_REPORTS}) n
    RETURNING id, username`)
  const targetIds = users
    .toSorted((a, b) => Number(a.username.split('-').at(-1)) - Number(b.username.split('-').at(-1)))
    .map(row => row.id)
  const { rows } = await query<{ id: string; reporter_user_id: string; pending: boolean }>(sql`
    /* seedModerationReportListRows */
    WITH cases AS (
      INSERT INTO moderation_cases (reported_user_id)
      SELECT id FROM unnest(${targetIds}::uuid[]) AS target(id)
      RETURNING id, reported_user_id
    ), system_reporter AS (
      SELECT id FROM users WHERE username = ${BAN_EVASION_SYSTEM_USERNAME}
    ), anchor AS (
      SELECT left(uuidv7()::text, 30) AS prefix
    )
    INSERT INTO moderation_reports
      (id, created_via, reporter_user_id, reported_user_id, case_id, reason, original_reason,
        reviewed_at, resolution_action)
    SELECT (anchor.prefix || lpad(to_hex(target.n), 6, '0'))::uuid, 'system',
      CASE WHEN target.n % 7 = 0 THEN system_reporter.id ELSE ${seedUser.id}::uuid END,
      cases.reported_user_id, cases.id, 'spam', 'spam',
      CASE WHEN target.n % 5 = 0 THEN CURRENT_TIMESTAMP END,
      CASE WHEN target.n % 5 = 0 THEN 'dismissed'::moderation_report_resolution_actions END
    FROM unnest(${targetIds}::uuid[]) WITH ORDINALITY AS target(id, n)
    JOIN cases ON cases.reported_user_id = target.id
    CROSS JOIN system_reporter CROSS JOIN anchor
    RETURNING id, reporter_user_id, reviewed_at IS NULL AS pending`)
  await query.commit()
  const pending = rows.filter(row => row.pending).toSorted((a, b) => b.id.localeCompare(a.id))
  assert.equal(rows.length, SEEDED_REPORTS)
  return {
    targetIds,
    // The list is global. The fence keeps unrelated newer seed rows outside the page.
    upperId: `${pending[0]!.id.slice(0, 30)}ffffff`,
    staffIds: pending.map(row => row.id),
    memberIds: pending.filter(row => row.reporter_user_id === seedUser.id).map(row => row.id),
  }
}
