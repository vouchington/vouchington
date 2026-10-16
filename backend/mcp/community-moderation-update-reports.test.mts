import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  readAdminWorkflowTraining,
  readAdminWorkflowWarnings,
} from '@voucha/test-helpers/admin-workflow-fixtures'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { readStaffActionTarget } from '@voucha/test-helpers/staff-action-history'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

async function reportFixture() {
  const moderator = await createTestPlusMcpCaller()
  const target = await createTestUser()
  const reporter = await createTestUser()
  const community = await insertTestCommunity({ createdById: moderator.id })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'owner',
  })
  await insertTestCommunityMember({ communityId: community.id, userId: target.id })
  const postId = await insertTestPost({
    title: 'Reported post',
    slug: `training-report-${crypto.randomUUID().slice(0, 8)}`,
    markdown: 'Reported post body',
    createdById: target.id,
    communityId: community.id,
  })
  const reportId = await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'post',
    entityId: postId,
    communityId: community.id,
  })
  return { moderator, target, community, reportId }
}

describe('community moderation MCP implicit decisions — real PostgreSQL and Valkey', () => {
  it('resolves a report without recording agent training feedback', async () => {
    const { moderator, community, reportId } = await reportFixture()
    expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])

    const result = await callStructuredMcpTool(
      moderator,
      'update_community_moderation',
      optionArgs('resolve_report', { community: community.slug, reportId, status: 'dismissed' }),
      scopes,
    )
    expect(result.report).toMatchObject({ id: reportId, status: 'dismissed' })
    expect(await readStaffActionTarget('report', reportId)).toMatchObject({
      resolution_action: 'dismissed',
      resolved_by_id: moderator.id,
    })
    expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])
  })

  it('issues a report-linked warning and resolves it without recording agent training feedback', async () => {
    const { moderator, target, community, reportId } = await reportFixture()
    expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])

    const result = await callStructuredMcpTool(
      moderator,
      'add_community_moderation',
      optionArgs('issue_warning', {
        community: community.slug,
        userId: target.id,
        reason: 'A fixture warning',
        reportId,
        resolveReport: true,
      }),
      scopes,
    )
    expect(result.warning).toMatchObject({
      community_id: community.id,
      issued_by_id: moderator.id,
      report_id: reportId,
    })
    expect(result.warning).not.toHaveProperty('user_id')
    expect(result.warning).not.toHaveProperty('case_id')
    expect(await readAdminWorkflowWarnings(target.id)).toEqual([
      expect.objectContaining({ issued_by_id: moderator.id }),
    ])
    expect(await readStaffActionTarget('report', reportId)).toMatchObject({
      resolution_action: 'actioned',
      resolved_by_id: moderator.id,
    })
    expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])
  })
})
