/**
 * Audit-storage failure behavior of POST /api/v1/mcp, the same fail-closed contract as the admin
 * route: a call that cannot be recorded first is refused before it runs, while a lost follow-up
 * tool_error row never fails a finished call. There is no fail-open switch to test.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  issueTestUserMcpCredential,
  type UserMcpCredentialKind,
} from '@voucha/test-helpers/mcp-user-credentials'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import type { Tool } from '@services/openai-agents/tool-types'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import * as audit from './audit.mts'
import * as handleRequest from './handle-request.mts'

const RUN_TOOL = 'user_audit_failure_fixture'
const invoked = vi.fn<() => void>()
const runTool = {
  roles: { user: true },
  schema: {
    name: RUN_TOOL,
    type: 'function',
    description: 'Records that it ran, then fails.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  function: (_currentUser: unknown) => () => {
    invoked()
    return Promise.reject(new Error('fixture failure'))
  },
  meta: {
    surfaces: ['mcp'],
    title: RUN_TOOL,
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: null,
  },
} as unknown as Tool
const CALL_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: RUN_TOOL, arguments: {} },
}

function postUserMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

describe.each<UserMcpCredentialKind>(['oauth', 'api_key'])(
  'POST /api/v1/mcp with an %s credential when the audit log is unavailable',
  kind => {
    beforeAll(() => {
      ;(ALL_TOOLS as Tool[]).push(runTool)
    })

    beforeEach(() => invoked.mockReset())

    afterEach(() => vi.restoreAllMocks())

    afterAll(() => {
      const tools = ALL_TOOLS as Tool[]
      tools.splice(tools.indexOf(runTool), 1)
    })

    it('refuses the call with 503 and never runs the tool', async () => {
      const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')
      const storageError = new Error('audit storage down')
      vi.spyOn(audit, 'recordMcpCallAudit').mockRejectedValueOnce(storageError)
      const handle = vi.spyOn(handleRequest, 'handleMcpHttpRequest')

      const response = await postUserMcp(token, CALL_BODY).expect(503)

      expect(response.text).toContain('Audit log unavailable')
      expect(handle).not.toHaveBeenCalled()
      expect(invoked).not.toHaveBeenCalled()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(storageError, expect.any(Object))
      await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
    })

    it('does not fail a finished tool call when only its tool_error row is lost', async () => {
      const { user, token } = await issueTestUserMcpCredential(kind, 'topics:read')
      const recordForReal = audit.recordMcpCallAudit
      const lostRow = new Error('follow-up row lost')
      vi.spyOn(audit, 'recordMcpCallAudit')
        .mockImplementationOnce(recordForReal)
        .mockRejectedValueOnce(lostRow)

      const response = await postUserMcp(token, CALL_BODY).expect(200)

      expect(JSON.stringify(response.body)).toContain('isError')
      expect(invoked).toHaveBeenCalledOnce()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(lostRow, expect.any(Object))
      const events = await readTestMcpCallAuditEvents(user.id)
      expect(events.map(event => event.outcome)).toEqual(['accepted'])
    })
  },
)
