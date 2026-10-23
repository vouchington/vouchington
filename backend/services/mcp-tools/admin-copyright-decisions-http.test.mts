import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  decryptTestCopyrightDecisionRationale,
  readTestCopyrightDecisionRationales,
  readTestCopyrightMcpAuditRows,
} from '@voucha/test-helpers/copyright-mcp-audit'
import { readTestMcpCallAuditRowText } from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { copyrightConfig } from '@services/copyright-notices/config'
import { createCopyrightReplayFixture } from '@voucha/test-helpers/copyright-route-replay-setup'
import { markTestCopyrightNoticeErasedAndCommit } from '@voucha/test-helpers/copyright-email-manual-association'
import { insertTestCopyrightDecisionRationaleForCase } from '@voucha/test-helpers/data-stores/psql/copyright-decision-rationale'
import { exhaustCopyrightActionIntent } from '@voucha/test-helpers/copyright-route-replay-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'

const TOOL = 'replay_copyright_intent'
const pathArgs = { id: crypto.randomUUID(), intentId: crypto.randomUUID() }
const RATIONALE_A = 'Staff reviewed the first failed action.'
const RATIONALE_B = 'Staff reviewed the second failed action.'

function toolCall(args: Record<string, unknown>, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: TOOL, arguments: { option: 'action', arguments: args } },
  }
}

function postAdminMcp(token: string, body: object) {
  return createRequest()
    .post('/api/v1/legal/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

async function issueAdmin(scope: string) {
  const user = await createTestUser({ administrator: true })
  const { tokens } = await issueTestOAuthTokensForClient(user, {
    audience: 'legal',
    scope,
  })
  return { user, token: tokens.access_token }
}

describe('copyright decision tools on POST /api/v1/legal/mcp', () => {
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
    expect(audit.map(row => [row.outcome, row.tool_name])).toEqual([
      ['accepted', null],
      ['not_found', null],
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

  it('writes validated legal rationale with the case, independently of the security audit', async () => {
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
      const rationales = await readTestCopyrightDecisionRationales(user.id)
      expect(rationales).toHaveLength(2)
      expect(rationales.map(row => row.copyright_notice_id)).toEqual([
        fixture.noticeId,
        fixture.noticeId,
      ])
      expect(rationales[0]?.rationale_ciphertext).not.toBe(rationales[1]?.rationale_ciphertext)
      expect(decryptTestCopyrightDecisionRationale(rationales[0]!)).toBe(RATIONALE_A)
      expect(decryptTestCopyrightDecisionRationale(rationales[1]!)).toBe(RATIONALE_B)
      expect(() =>
        decryptTestCopyrightDecisionRationale(rationales[0]!, rationales[1]!.id),
      ).toThrow(/./)
      for (const text of await readTestMcpCallAuditRowText(user.id)) {
        expect(text).not.toContain(RATIONALE_A)
        expect(text).not.toContain(RATIONALE_B)
        expect(text).not.toContain('private-extra')
      }
    } finally {
      restoreEnabled()
    }
  })

  it('keeps an invalid target attempt in the security audit without inventing a legal case', async () => {
    const { user, token } = await issueAdmin('copyright-notices:read copyright-notices:write')
    const restoreEnabled = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      mcpDecisionTools: true,
    })
    try {
      const response = await postAdminMcp(
        token,
        toolCall({ ...pathArgs, rationale: RATIONALE_A }),
      ).expect(200)
      expect(response.body.result?.isError).not.toBe(true)
      expect(JSON.stringify(response.body)).toContain('replayed')
      await postAdminMcp(
        token,
        toolCall(
          { ...pathArgs, id: '------------------------------------', rationale: RATIONALE_A },
          2,
        ),
      ).expect(200)
      const rows = await readTestCopyrightMcpAuditRows(user.id)
      expect(rows.map(row => row.outcome)).toContain('accepted')
      expect(await readTestCopyrightDecisionRationales(user.id)).toHaveLength(0)
    } finally {
      restoreEnabled()
    }
  })

  it('keeps the security attempt but writes no new rationale ciphertext after case erasure', async () => {
    const { user, token } = await issueAdmin('copyright-notices:read copyright-notices:write')
    const fixture = await createCopyrightReplayFixture()
    await markTestCopyrightNoticeErasedAndCommit(fixture.noticeId)
    const restoreEnabled = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      mcpDecisionTools: true,
    })
    try {
      await postAdminMcp(
        token,
        toolCall({ id: fixture.noticeId, intentId: fixture.intentId, rationale: RATIONALE_A }),
      ).expect(200)
      expect((await readTestCopyrightMcpAuditRows(user.id)).map(row => row.outcome)).toContain(
        'accepted',
      )
      expect(await readTestCopyrightDecisionRationales(user.id)).toHaveLength(0)

      // The database guard also covers writers that bypass the MCP admission path.
      await insertTestCopyrightDecisionRationaleForCase(fixture.noticeId, user.id)
      expect(await readTestCopyrightDecisionRationales(user.id)).toHaveLength(0)
    } finally {
      restoreEnabled()
    }
  })
})
