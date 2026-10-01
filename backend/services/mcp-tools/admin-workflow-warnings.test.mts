import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport } from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  readStaffActionTarget,
} from '@voucha/test-helpers/staff-action-history'
import {
  readAdminWorkflowTraining,
  readAdminWorkflowWarnings,
} from '@voucha/test-helpers/admin-workflow-fixtures'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

async function fixture() {
  const admin = await createTestUser({ administrator: true })
  const target = await createTestUser()
  const reporter = await createTestUser()
  const reportId = await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'user',
    entityId: target.id,
  })
  return { admin, target, reportId }
}

describe('registered issue_user_warning tool', () => {
  it('issues a linked warning and resolves its report with actor history but no agent training', async () => {
    const { admin, target, reportId } = await fixture()
    const result = await callMcpTool(
      'issue_user_warning',
      { userId: target.id, reason: 'Fixture warning', reportId, resolveReport: true },
      { ...admin, membership_plan: null },
      ['moderation:write'],
      ADMIN_MCP_SERVER_CONFIG,
    )
    expect(result.isError).not.toBe(true)
    expect(await readAdminWorkflowWarnings(target.id)).toEqual([
      expect.objectContaining({ issued_by_id: admin.id }),
    ])
    expect(await readStaffActionTarget('report', reportId)).toMatchObject({
      resolution_action: 'actioned',
      resolved_by_id: admin.id,
    })
    expect(await readStaffActionHistory(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_type: 'warn', target_user_id: target.id }),
        expect.objectContaining({ action_type: 'resolve_report', report_id: reportId }),
      ]),
    )
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })

  it('refuses a report owned by a different target without a warning or any other effects', async () => {
    const { admin, reportId } = await fixture()
    const other = await createTestUser()
    const before = await readStaffActionTarget('report', reportId)
    const result = await callMcpTool(
      'issue_user_warning',
      { userId: other.id, reason: 'Fixture warning', reportId, resolveReport: true },
      { ...admin, membership_plan: null },
      ['moderation:write'],
      ADMIN_MCP_SERVER_CONFIG,
    )
    expect(result.isError).toBe(true)
    const block = result.content[0]!
    if (block.type !== 'text') throw new Error('Expected typed error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 422, retryable: false } })
    expect(await readAdminWorkflowWarnings(other.id)).toEqual([])
    expect(await readStaffActionTarget('report', reportId)).toEqual(before)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })
})
