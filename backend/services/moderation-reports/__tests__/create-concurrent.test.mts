import { describe, it, expect } from 'vitest'
import { createTestUser, insertTestPost, WEB_PROVENANCE } from '@voucha/test-helpers'
import { listTestModerationCasesForEntity } from '@voucha/test-helpers/entities/moderation-case-reads'
import { runTwoTransactionsAfterEmptyReadForTest } from '@voucha/test-helpers/concurrent-transaction-queries'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('concurrent first moderation reports', () => {
  it('shares one open case across concurrent first reports for the same post', async () => {
    const entityId = await insertTestPost({
      createdById: (await createTestUser()).id,
      title: 'Concurrent reports',
      slug: `concurrent-${crypto.randomUUID()}`,
      markdown: 'Test content',
    })
    const [firstReporter, secondReporter] = await Promise.all([createTestUser(), createTestUser()])
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId,
      reason: 'spam',
      note: null,
    })
    const entity = { entityType: 'post', entityId } as const
    expect(await listTestModerationCasesForEntity(entity)).toEqual([])

    const reporters = [firstReporter, secondReporter] as const
    const [first, second] = await runTwoTransactionsAfterEmptyReadForTest(
      '/* findOpenCaseForEntity */',
      (query, index) =>
        createModerationReport(reporters[index].id, WEB_PROVENANCE, input, { query }),
    )

    expect(first.isDuplicate).toBe(false)
    expect(second.isDuplicate).toBe(false)
    expect(first.report.case_id).toBe(second.report.case_id)
    expect(await listTestModerationCasesForEntity(entity)).toMatchObject([
      { id: first.report.case_id, resolved_at: null },
    ])
  })
})
