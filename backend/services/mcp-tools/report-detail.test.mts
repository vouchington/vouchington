import { describe, expect, it } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import { suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers/entities/users'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { getMcpAdmissionUser } from './admission-user.mts'
import { buildMcpContextUser } from './list-tools.mts'

const invoke = (user: Awaited<ReturnType<typeof createTestUser>>, id: string, suspended = false) =>
  callMcpTool(
    'read_moderation_report',
    { id },
    { ...user, membership_plan: null, suspended },
    ['moderation:read'],
    ADMIN_MCP_SERVER_CONFIG,
  )

describe('moderation report detail MCP tool', () => {
  it('rechecks a staff role revoked after bearer admission before reading a report', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const admitted = await getMcpAdmissionUser(moderator.id)
    expect(admitted?.roles).toContain('moderator')
    if (!admitted) throw new Error('Expected admitted moderator')

    await removeTestUserRole(moderator.id, 'moderator')
    const result = await callMcpTool(
      'read_moderation_report',
      { id: crypto.randomUUID() },
      buildMcpContextUser(admitted, false),
      ['moderation:read'],
      ADMIN_MCP_SERVER_CONFIG,
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatchObject([{ type: 'text', text: expect.stringContaining('403') }])
  })

  it('returns the current persisted judgement, rejects unavailable reports, and permits suspended reads', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const member = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `report-detail-mcp-${crypto.randomUUID()}`,
      title: 'Reported post',
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const pending = await invoke(moderator, reportId)
    expect(pending.isError).not.toBe(true)
    expect(pending.structuredContent).toMatchObject({ report: { id: reportId }, judgement: null })
    await expect(invoke(member, reportId)).rejects.toMatchObject({ code: ErrorCode.InvalidRequest })
    const missing = await invoke(moderator, crypto.randomUUID())
    expect(missing.isError).toBe(true)
    expect(missing.content).toMatchObject([
      { type: 'text', text: expect.stringContaining('"status":404') },
    ])

    const firstJudgementId = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'warn',
      publicResponse: 'Saved public response.',
      internalResponse: 'Saved staff rationale.',
    })
    const secondJudgementId = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'warn',
      publicResponse: 'Saved public response.',
      internalResponse: 'Saved staff rationale.',
    })
    expect(secondJudgementId).not.toBe(firstJudgementId)

    const result = await invoke(moderator, reportId)

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      report: { id: reportId, entity_type: 'post', entity_id: postId },
      judgement: {
        id: secondJudgementId,
        recommended_action: 'warn',
        public_response: expect.stringContaining('Saved public response.'),
        internal_response: 'Saved staff rationale.',
      },
    })

    await suspendTestUser(moderator.id)
    try {
      const suspendedRead = await invoke(moderator, reportId, true)
      expect(suspendedRead.isError).not.toBe(true)
      expect(suspendedRead.structuredContent).toMatchObject({
        judgement: { id: secondJudgementId, internal_response: 'Saved staff rationale.' },
      })
    } finally {
      await unsuspendTestUser(moderator.id)
    }
  })
})
