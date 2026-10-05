import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  decryptTestCopyrightMcpRationale,
  readTestCopyrightMcpAuditRows,
} from '@voucha/test-helpers/copyright-mcp-audit'
import { readTestMcpCallAuditRowText } from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { copyrightConfig } from '@services/copyright-notices/config'
import { createCopyrightReplayFixture } from '@voucha/test-helpers/copyright-route-replay-setup'
import { exhaustCopyrightActionIntent } from '@voucha/test-helpers/copyright-route-replay-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'

const TOOL = 'replay_copyright_action_intent'
const pathArgs = { id: crypto.randomUUID(), intentId: crypto.randomUUID() }
const RATIONALE_A = 'Staff reviewed the first failed action.'
const RATIONALE_B = 'Staff reviewed the second failed action.'

function toolCall(args: Record<string, unknown>, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: TOOL, arguments: args },
  }
}

function postAdminMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/admin/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function issueAdmin(scope: string) {
  const user = await createTestUser({ administrator: true })
  const { tokens } = await issueTestOAuthTokensForClient(user, {
    audience: 'admin',
    scope,
  })
  return { user, token: tokens.access_token }
}

describe('copyright decision tools on POST /api/v1/admin/mcp', () => {
  useCopyrightMcpDecisionTools(false)

  it('hides disabled tools before an OAuth scope challenge, then rechecks availability per request', async () => {
    const { user, token } = await issueAdmin('copyright-notices:read')
    const list = await postAdminMcp(token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }).expect(200)
    const names = (list.body as { result: { tools: Array<{ name: string }> } }).result.tools.map(
      tool => tool.name,
    )
    expect(names).not.toContain(TOOL)

    const off = await postAdminMcp(token, toolCall({ ...pathArgs, rationale: RATIONALE_A })).expect(
      200,
    )
    expect(off.body.error?.code).toBe(-32601)
    expect(off.headers['www-authenticate']).toBeUndefined()
    let audit = await readTestCopyrightMcpAuditRows(user.id)
    expect(
      audit.map(row => [row.outcome, row.tool_name, row.copyright_rationale_ciphertext]),
    ).toEqual([
      ['accepted', null, null],
      ['not_found', null, null],
    ])

    const restoreEnabled = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      mcpDecisionTools: true,
    })
    try {
      const enabledList = await postAdminMcp(token, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }).expect(200)
      const enabledNames = (
        enabledList.body as { result: { tools: Array<{ name: string }> } }
      ).result.tools.map(tool => tool.name)
      expect(enabledNames).not.toContain(TOOL)
      const challenged = await postAdminMcp(
        token,
        toolCall({ ...pathArgs, rationale: RATIONALE_A }),
      ).expect(403)
      expect(challenged.headers['www-authenticate']).toContain('error="insufficient_scope"')
      expect(challenged.headers['www-authenticate']).toContain('copyright-notices:write')
      audit = await readTestCopyrightMcpAuditRows(user.id)
      expect(audit.at(-1)).toMatchObject({
        outcome: 'insufficient_scope',
        tool_name: TOOL,
        copyright_rationale_ciphertext: null,
      })
    } finally {
      restoreEnabled()
    }
    const disabledAgain = await postAdminMcp(
      token,
      toolCall({ ...pathArgs, rationale: RATIONALE_A }),
    ).expect(200)
    expect(disabledAgain.body.error?.code).toBe(-32601)
  })

  it('encrypts only validated admitted rationale, binding each batch call to its own persisted row id', async () => {
    const { user, token } = await issueAdmin('copyright-notices:read copyright-notices:write')
    const fixture = await createCopyrightReplayFixture()
    await exhaustCopyrightActionIntent(fixture.intentId)
    const replayArgs = { id: fixture.noticeId, intentId: fixture.intentId }
    const restoreEnabled = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      mcpDecisionTools: true,
    })
    try {
      const response = await postAdminMcp(token, [
        toolCall({ ...replayArgs, rationale: RATIONALE_A }, 1),
        toolCall({ ...replayArgs, rationale: RATIONALE_B }, 2),
        toolCall({ ...replayArgs, rationale: '   ' }, 3),
        toolCall({ ...replayArgs, rationale: RATIONALE_A, injected: 'private-extra' }, 4),
        { jsonrpc: '2.0', id: 5, method: 'tools/list' },
      ]).expect(200)
      expect(response.body).toHaveLength(5)
      const rows = await readTestCopyrightMcpAuditRows(user.id)
      expect(rows.map(row => row.outcome)).toEqual([
        'accepted',
        'accepted',
        'invalid_arguments',
        'invalid_arguments',
        'accepted',
      ])
      expect(rows.map(row => row.tool_name)).toEqual([TOOL, TOOL, TOOL, TOOL, null])
      expect(rows.every(row => row.correlation_id === response.headers['x-correlation-id'])).toBe(
        true,
      )
      expect(rows[0]?.copyright_rationale_ciphertext).toEqual(expect.any(String))
      expect(rows[1]?.copyright_rationale_ciphertext).toEqual(expect.any(String))
      expect(rows[0]?.copyright_rationale_ciphertext).not.toBe(
        rows[1]?.copyright_rationale_ciphertext,
      )
      expect(decryptTestCopyrightMcpRationale(rows[0]!)).toBe(RATIONALE_A)
      expect(decryptTestCopyrightMcpRationale(rows[1]!)).toBe(RATIONALE_B)
      expect(() => decryptTestCopyrightMcpRationale(rows[0]!, rows[1]!.id)).toThrow(/./)
      expect(rows.slice(2).every(row => row.copyright_rationale_ciphertext === null)).toBe(true)
      for (const text of await readTestMcpCallAuditRowText(user.id)) {
        expect(text).not.toContain(RATIONALE_A)
        expect(text).not.toContain(RATIONALE_B)
        expect(text).not.toContain('private-extra')
      }
    } finally {
      restoreEnabled()
    }
  })
})
