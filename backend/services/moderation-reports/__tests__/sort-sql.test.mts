import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import { appendModerationReportCursorPredicate, appendModerationReportOrder } from '../sort-sql.mts'

const cursor = {
  createdAt: '2026-06-01T00:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000001',
  reportCount: 3,
  severityRank: 2,
}

describe('moderation report sort SQL', () => {
  it('builds severity cursor predicates with severity and report-count tie breakers', () => {
    const query = createTestSqlStatement()

    appendModerationReportCursorPredicate(query, 'severity', cursor)

    expect(query.text).toContain('latest_judgement.recommended_action')
    expect(query.text).toContain('report_counts.report_count < $')
    expect(query.text).toContain('report_counts.report_count = $')
    expect(query.text).toContain('AND r.id > $')
    expect(query.text.trim()).toMatch(/\){4}$/)
  })

  it('builds most-reported cursor predicates with count tie breakers', () => {
    const query = createTestSqlStatement()

    appendModerationReportCursorPredicate(query, 'most_reported', cursor)

    expect(query.text).not.toContain('FROM moderation_reports cursor_report')
    expect(query.text).toContain('report_counts.report_count < $')
    expect(query.text).toContain('report_counts.report_count = $')
    expect(query.text).toContain('AND r.id > $')
  })

  it('builds created-time cursor predicates and order clauses', () => {
    const ascQuery = createTestSqlStatement()
    const descQuery = createTestSqlStatement()

    appendModerationReportCursorPredicate(ascQuery, 'created_at_asc', cursor)
    appendModerationReportOrder(descQuery, 'created_at_desc', 26)

    expect(ascQuery.text).not.toContain('r.created_at')
    expect(ascQuery.text).toContain('AND r.id > $')
    expect(descQuery.text).toContain('ORDER BY r.id DESC')
    expect(descQuery.text).toContain('LIMIT $')
  })
})
