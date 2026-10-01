/**
 * Audit-storage failure behavior of POST /api/v1/admin/mcp: a call that cannot be recorded first
 * is refused before it runs, while a lost follow-up tool_error row never fails a finished call.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { Tool } from '@voucha/tools/types'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import * as audit from './audit.mts'
import * as handleRequest from './handle-request.mts'

const FAIL_TOOL = 'admin_audit_failure_fixture'
const LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
const failingTool = {
  roles: { administrator: true },
  schema: {
    name: FAIL_TOOL,
    type: 'function',
    description: 'Always fails.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  function: (_currentUser: unknown) => () => Promise.reject(new Error('fixture failure')),
  meta: {
    surfaces: ['admin_mcp'],
    title: FAIL_TOOL,
    requiredScopes: { admin_mcp: ['mcp.admin:read'] },
    annotations: { readOnlyHint: true },
    api: null,
  },
} as unknown as Tool

async function issueAdmin() {
  const user = await createTestUser({ administrator: true })
  const tokens = await issueTestOAuthTokens(user, { audience: 'admin', scope: 'mcp.admin:read' })
  return { user, token: tokens.access_token }
}

function postAdminMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/admin/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

describe('POST /api/v1/admin/mcp when the audit log is unavailable', () => {
  beforeAll(() => {
    ;(ALL_TOOLS as Tool[]).push(failingTool)
  })

  afterEach(() => vi.restoreAllMocks())

  afterAll(() => {
    const tools = ALL_TOOLS as Tool[]
    tools.splice(tools.indexOf(failingTool), 1)
  })

  it('refuses the call with 503 and never hands it to the MCP server', async () => {
    const { user, token } = await issueAdmin()
    const storageError = new Error('audit storage down')
    vi.spyOn(audit, 'recordMcpCallAudit').mockRejectedValueOnce(storageError)
    const handle = vi.spyOn(handleRequest, 'handleMcpHttpRequest')

    const response = await postAdminMcp(token, LIST_BODY).expect(503)

    expect(response.text).toContain('Audit log unavailable')
    expect(handle).not.toHaveBeenCalled()
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(storageError, expect.any(Object))
    await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
  })

  it('answers 503 instead of a rejection when the rejection itself cannot be recorded', async () => {
    const { user, token } = await issueAdmin()
    await removeTestUserRole(user.id, 'administrator')
    vi.spyOn(audit, 'recordMcpCallAudit').mockRejectedValueOnce(new Error('audit storage down'))

    await postAdminMcp(token, LIST_BODY).expect(503)
  })

  it('does not fail a finished tool call when only its tool_error row is lost', async () => {
    const { user, token } = await issueAdmin()
    const recordForReal = audit.recordMcpCallAudit
    const lostRow = new Error('follow-up row lost')
    vi.spyOn(audit, 'recordMcpCallAudit')
      .mockImplementationOnce(recordForReal)
      .mockRejectedValueOnce(lostRow)

    const response = await postAdminMcp(token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: FAIL_TOOL, arguments: {} },
    }).expect(200)

    expect(JSON.stringify(response.body)).toContain('isError')
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(lostRow, expect.any(Object))
    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events.map(event => event.outcome)).toEqual(['accepted'])
  })
})
