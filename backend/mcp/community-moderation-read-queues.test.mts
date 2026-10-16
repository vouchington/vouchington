import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { getTestModerationReportCaseId } from '@voucha/test-helpers/entities/moderation-reports'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read'] as const

describe('community moderation MCP pending report reads — real PostgreSQL and Valkey', () => {
  it('returns a linked pending report without exposing its internal case ID', async () => {
    const moderator = await createTestPlusMcpCaller()
    const member = await createTestUser()
    const author = await createTestUser()
    const reporter = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'owner',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: 'Pending report fixture',
      slug: `pending-report-${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Content under review',
      createdById: author.id,
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      communityId: community.id,
    })
    const caseId = await getTestModerationReportCaseId(reportId)
    const args = optionArgs('list_pending_reports', { community: community.id })

    expect(await callRejectedMcpTool(member, 'read_community_moderation', args, scopes)).toContain(
      'Forbidden',
    )
    const page = await callStructuredMcpTool(moderator, 'read_community_moderation', args, scopes)
    expect(page.reports).toEqual([expect.objectContaining({ id: reportId })])
    expect((page.reports as Array<Record<string, unknown>>)[0]).not.toHaveProperty('case_id')
    expect(JSON.stringify(page)).not.toContain(caseId)
  })
})
