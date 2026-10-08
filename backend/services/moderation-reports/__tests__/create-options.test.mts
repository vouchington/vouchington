import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { countTestModerationReportsByReporter } from '@voucha/test-helpers/mcp-write-tool-rows'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('createModerationReport database options', () => {
  it('joins the caller transaction and rolls back with it', async () => {
    const reporter = await createTestUser()
    const target = await createTestUser()
    const input = parseCreateModerationReportInput({
      entityType: 'user',
      entityId: target.id,
      reason: 'spam',
      note: null,
    })
    const before = await countTestModerationReportsByReporter(reporter.id)

    {
      await using query = await beginTransaction()
      const { report } = await createModerationReport(reporter.id, WEB_PROVENANCE, input, { query })
      expect(report.reporter_user_id).toBe(reporter.id)
    }

    expect(await countTestModerationReportsByReporter(reporter.id)).toBe(before)
  })

  it('rejects client and readOnly fields without creating a report', async () => {
    const reporter = await createTestUser()
    const target = await createTestUser()
    const input = parseCreateModerationReportInput({
      entityType: 'user',
      entityId: target.id,
      reason: 'spam',
      note: null,
    })
    const before = await countTestModerationReportsByReporter(reporter.id)
    await using query = await beginTransaction()

    for (const options of [
      { query, client: query.client },
      { query, readOnly: true },
    ]) {
      await expect(
        createModerationReport(reporter.id, WEB_PROVENANCE, input, options),
      ).rejects.toThrow('Only query is supported for moderation report creation')
    }
    expect(await countTestModerationReportsByReporter(reporter.id)).toBe(before)
  })
})
