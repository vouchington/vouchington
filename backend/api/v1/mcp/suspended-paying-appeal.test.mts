/**
 * A suspended Plus or Pro member keeps an existing OAuth grant and can appeal on the user MCP
 * server. Suspended moderation staff retain report reads on the admin server; other admin tools
 * and mutations remain unavailable.
 */
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  insertTestUserWarning,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { endTestMembershipProjection } from '@voucha/test-helpers/entities/memberships-state'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthRefreshToken } from '@services/oauth-authorization-server'

const APPEAL_TOOLS = ['create_moderation_appeal', 'read_my_moderation_appeals']
const REPORT_READ_TOOLS = ['list_moderation_reports', 'read_moderation_report']
const USER_MCP = '/api/v1/mcp'
const ADMIN_MCP = '/api/v1/admin/mcp'
const LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }

function toolCall(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
}

function postMcp(path: string, token: string, body: unknown) {
  return createRequest()
    .post(path)
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object)
}

function toolNames(body: unknown): string[] {
  const tools = (body as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? []
  return tools.map(tool => tool.name).toSorted()
}

function structuredResult(body: unknown): Record<string, unknown> {
  const text = (body as { result?: { content?: Array<{ text?: string }> } }).result?.content?.[0]
    ?.text
  return JSON.parse(text ?? '{}') as Record<string, unknown>
}

async function refreshAfterSuspension(
  user: { id: string },
  audience?: 'admin',
  adminScope = 'mcp.admin:read',
) {
  const issued = await issueTestOAuthTokensForClient(
    user,
    audience === 'admin' ? { audience: 'admin', scope: adminScope } : undefined,
  )
  await suspendTestUser(user.id)
  const refreshed = await exchangeOAuthRefreshToken({
    clientId: issued.clientId,
    refreshToken: issued.tokens.refresh_token,
  })
  return refreshed.access_token
}

describe('suspended paying users on MCP', () => {
  it('refreshes, lists only the appeal tools, files and reads an appeal, and denies the rest', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const rest = createRequest()
    await rest.authenticateAs(user)
    const staff = await createTestUser()
    const warning = await insertTestUserWarning({ userId: user.id, issuedById: staff.id })
    const token = await refreshAfterSuspension(user)

    const listed = await postMcp(USER_MCP, token, LIST_BODY).expect(200)
    expect(toolNames(listed.body)).toEqual([...APPEAL_TOOLS].toSorted())

    const created = await postMcp(
      USER_MCP,
      token,
      toolCall('create_moderation_appeal', {
        idempotency_key: crypto.randomUUID(),
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'This warning was a mistake.',
      }),
    ).expect(200)
    expect(created.body).not.toHaveProperty('error')
    const appeal = structuredResult(created.body)
    expect(appeal).toMatchObject({
      success: true,
      is_duplicate: false,
      appeal: { target_type: 'warning', target_id: warning.id, status: 'pending' },
    })

    const appealId = (appeal.appeal as { id: string }).id
    const restAppeal = await rest.get(`/api/v1/appeals/${appealId}`).expect(200)
    const mcpAppeal = await postMcp(
      USER_MCP,
      token,
      toolCall('read_my_moderation_appeals', optionArgs('get', { appeal_id: appealId })),
    ).expect(200)
    const mcpFacts = structuredResult(mcpAppeal.body).appeal as Record<string, unknown>
    const restFacts = restAppeal.body.appeal as Record<string, unknown>
    // MCP exposes target ids rather than REST's display context; authorization and shared facts agree.
    expect(mcpFacts.target_type).toBe('warning')
    expect(mcpFacts.target_id).toBe(restFacts.user_warning_id)
    for (const field of [
      'id',
      'status',
      'community_id',
      'post_removal_kind',
      'is_overdue',
      'resolution_action',
      'public_response',
      'resolved_at',
      'sent_at',
      'created_at',
      'updated_at',
    ]) {
      expect(mcpFacts[field]).toEqual(restFacts[field])
    }
    const read = await postMcp(
      USER_MCP,
      token,
      toolCall('read_my_moderation_appeals', optionArgs('list', {})),
    ).expect(200)
    expect(structuredResult(read.body)).toMatchObject({
      success: true,
      appeals: [expect.objectContaining({ id: appealId })],
    })

    const denied = await postMcp(
      USER_MCP,
      token,
      toolCall('read_my_profile', optionArgs('overview', {})),
    ).expect(200)
    expect(denied.body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32600, message: 'MCP error -32600: suspended' },
    })

    await rest.patch('/api/v1/my/profile').send({ markdown: 'Suspended write' }).expect(403)
    const deniedWrite = await postMcp(
      USER_MCP,
      token,
      toolCall('edit_my_profile', optionArgs('bio', { markdown: 'Suspended write' })),
    ).expect(200)
    expect(deniedWrite.body.error).toMatchObject({
      code: -32600,
      message: expect.stringContaining('suspended'),
    })

    expect(await readTestMcpCallAuditEvents(user.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_user_id: user.id,
          tool_name: 'create_moderation_appeal',
          outcome: 'accepted',
        }),
        expect.objectContaining({
          actor_user_id: user.id,
          tool_name: 'read_my_profile',
          outcome: 'suspended',
        }),
        expect.objectContaining({
          actor_user_id: user.id,
          tool_name: 'edit_my_profile',
          outcome: 'suspended',
        }),
      ]),
    )
  })

  it('refreshes a suspended free user and rejects that token on the user server', async () => {
    const user = await createTestUser()
    const token = await refreshAfterSuspension(user)

    const response = await postMcp(USER_MCP, token, LIST_BODY).expect(401)

    expect(response.headers['www-authenticate']).toContain('error="invalid_token"')
    await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
  })

  it('allows a suspended paying administrator report reads but denies other admin tools', async () => {
    const admin = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: admin.id, plan: 'pro' })
    const token = await refreshAfterSuspension(admin, 'admin', 'moderation:read')

    const listed = await postMcp(ADMIN_MCP, token, LIST_BODY).expect(200)
    expect(toolNames(listed.body)).toEqual([...REPORT_READ_TOOLS].toSorted())

    const read = await postMcp(
      ADMIN_MCP,
      token,
      toolCall('read_moderation_report', { id: crypto.randomUUID() }),
    ).expect(200)
    expect(read.body.result).toMatchObject({ isError: true })
    expect(structuredResult(read.body)).toMatchObject({ error: { status: 404 } })

    for (const denied of [
      toolCall('resolve_moderation_report', {
        id: crypto.randomUUID(),
        status: 'reviewed',
      }),
      toolCall('read_crawler', optionArgs('list', {})),
    ]) {
      const response = await postMcp(ADMIN_MCP, token, denied).expect(200)
      expect(response.body.error).toMatchObject({
        code: -32600,
        message: expect.stringContaining('suspended'),
      })
    }

    expect(await readTestMcpCallAuditEvents(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_user_id: admin.id,
          tool_name: 'read_moderation_report',
          outcome: 'accepted',
        }),
        expect.objectContaining({
          actor_user_id: admin.id,
          tool_name: 'resolve_moderation_report',
          outcome: 'suspended',
        }),
        expect.objectContaining({
          actor_user_id: admin.id,
          tool_name: 'read_crawler',
          outcome: 'suspended',
        }),
      ]),
    )
  })

  it('restores the normal tool list after the suspension is lifted', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const token = await refreshAfterSuspension(user)
    expect(toolNames((await postMcp(USER_MCP, token, LIST_BODY).expect(200)).body)).toEqual(
      [...APPEAL_TOOLS].toSorted(),
    )

    await unsuspendTestUser(user.id)

    const names = toolNames((await postMcp(USER_MCP, token, LIST_BODY).expect(200)).body)
    expect(names).toContain('read_my_profile')
    expect(names.length).toBeGreaterThan(APPEAL_TOOLS.length)
  })

  it('rejects the next request when the paid plan lapses during the suspension', async () => {
    const user = await createTestUser()
    const membership = await createTestMembership({ user_id: user.id, plan: 'plus' })
    const token = await refreshAfterSuspension(user)
    await postMcp(USER_MCP, token, LIST_BODY).expect(200)

    await endTestMembershipProjection(membership.id)

    const response = await postMcp(USER_MCP, token, LIST_BODY).expect(401)
    expect(response.headers['www-authenticate']).toContain('error="invalid_token"')
    expect(await readTestMcpCallAuditEvents(user.id)).toEqual([
      expect.objectContaining({
        actor_user_id: user.id,
        jsonrpc_method: 'tools/list',
        outcome: 'accepted',
      }),
    ])
  })
})
