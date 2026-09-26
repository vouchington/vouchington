import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createModerationReport } from '../create.mts'
import { MODERATION_REPORT_REASONS } from '../config.mts'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('createModerationReport report reasons', () => {
  it('creates post reports for every shared report reason', async () => {
    const postAuthor = await createTestUser()

    for (const reason of MODERATION_REPORT_REASONS) {
      const reasonPostId = await insertTestPost({
        createdById: postAuthor.id,
        slug: `report-reason-${reason}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Report Reason ${reason} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'Test body',
      })
      const reasonReporter = await createTestUser()
      const { report } = await createModerationReport(
        WEB_PROVENANCE,
        reasonReporter.id,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: reasonPostId,
          reason,
          note: null,
        }),
      )

      expect(report.reason).toBe(reason)
    }
  })
})
