import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ErrorCode, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { PrivateUser } from '@services/users/types'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG, type McpServerConfig } from './config.mts'
import { handleMcpHttpRequest } from './handle-request.mts'
import { MCP_SERVER_INSTRUCTIONS } from './instructions.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

describe('handleMcpHttpRequest', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  const post = (body: Record<string, unknown>, config: McpServerConfig = USER_MCP_SERVER_CONFIG) =>
    handleMcpHttpRequest({
      user,
      permissions: ['mcp.user:read'],
      request: new Request(`http://localhost${config.routePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      }),
      parsedBody: body,
      config,
    })

  it.each([USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG])(
    'returns the $serverName instructions from initialize',
    async config => {
      const response = await post(
        {
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'handle-request-test', version: '1.0.0' },
          },
        },
        config,
      )

      expect(response.status).toBe(200)
      const json = (await response.json()) as { result?: { instructions?: string } }
      expect(json.result?.instructions).toBe(MCP_SERVER_INSTRUCTIONS[config.surface])
    },
  )

  it('returns a Response for tools/list request', async () => {
    const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { tools?: unknown[] } }
    expect(Array.isArray(json.result?.tools)).toBe(true)
  })

  it('rejects malformed authorized envelopes before any tool invocation', async () => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'search_topics_text')
    if (!tool) throw new Error('Expected search_topics_text tool')
    const invoke = vi.spyOn(tool, 'function')

    try {
      const response = await post({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { arguments: {} },
      })

      expect(response.status).toBe(200)
      const result = (await response.json()) as { error?: { code?: number } }
      expect(result.error?.code).toBe(ErrorCode.InvalidRequest)
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      invoke.mockRestore()
    }
  })

  it('returns a Response for tools/call request', async () => {
    const response = await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_topics_text', arguments: { text_search_query: 'hello' } },
    })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { isError?: boolean } }
    expect(json.result?.isError).not.toBe(true)
  }, 15_000)
})
