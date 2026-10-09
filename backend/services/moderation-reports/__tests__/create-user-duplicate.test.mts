import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  listTestPendingUserReportCommunityIds,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('createModerationReport user dedup', () => {
  it('keeps a global user report beside a community-stamped report from the same reporter', async () => {
    const reporter = await createTestUser()
    const reported = await createTestUser()
    const community = await insertTestCommunity({
      createdById: reporter.id,
      visibility: 'public',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: reported.id,
      reason: 'other',
      communityId: community.id,
    })

    const input = parseCreateModerationReportInput({
      entityType: 'user',
      entityId: reported.id,
      reason: 'spam',
      note: 'first global report',
    })
    const created = await createModerationReport(reporter.id, WEB_PROVENANCE, input)
    const duplicate = await createModerationReport(reporter.id, WEB_PROVENANCE, {
      ...input,
      note: 'updated global report',
    })

    expect(created.isDuplicate).toBe(false)
    expect(duplicate.isDuplicate).toBe(true)
    expect(duplicate.report.id).toBe(created.report.id)
    expect(duplicate.report.note).toBe('updated global report')
    await expect(listTestPendingUserReportCommunityIds(reported.id)).resolves.toEqual([
      null,
      community.id,
    ])
  })
})
