import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { moderationReportsWorkConfig } from '../work-limits.mts'
import { getReportJudgementContextForEntity } from '../judgement-context.mts'

describe('judgement report sample cap', () => {
  it('samples only the configured number of reports but still counts them all', async () => {
    const [author, ...reporters] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const postId = await insertTestPost({
      createdById: author!.id,
      slug: `sample-cap-${randomUUID()}`,
      title: 'Sample cap',
      markdown: 'body',
    })
    for (const reporter of reporters)
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })

    const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
      judgement_report_sample_cap: 2,
    })
    try {
      const context = await getReportJudgementContextForEntity('post', postId)
      expect(context.reports).toHaveLength(2)
      expect(context).toMatchObject({ reportCount: 3, reportCountCapped: false })
    } finally {
      restore()
    }
    const full = await getReportJudgementContextForEntity('post', postId)
    expect(full.reports).toHaveLength(3)
  })
})
