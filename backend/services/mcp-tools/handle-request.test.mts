import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { PrivateUser } from '@services/users/types'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { handleMcpHttpRequest } from './handle-request.mts'

type McpUser = PrivateUser & { membership_plan: 'plus' | 'pro' | null }

describe('handleMcpHttpRequest', () => {
  let user: McpUser

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  it('returns a Response for tools/list request', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    const response = await handleMcpHttpRequest({
      user,
      permissions: ['mcp.user:read'],
      request: new Request('http://localhost/api/v1/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      }),
      parsedBody: body,
      config: USER_MCP_SERVER_CONFIG,
    })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { tools?: unknown[] } }
    expect(Array.isArray(json.result?.tools)).toBe(true)
  })

  it('rejects malformed authorized envelopes before any tool invocation', async () => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'search_topics_text')
    if (!tool) throw new Error('Expected search_topics_text tool')
    const invoke = vi.spyOn(tool, 'function')
    const body = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { arguments: {} } }

    try {
      const response = await handleMcpHttpRequest({
        user,
        permissions: ['mcp.user:read'],
        request: new Request('http://localhost/api/v1/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify(body),
        }),
        parsedBody: body,
        config: USER_MCP_SERVER_CONFIG,
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
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_topics_text', arguments: { query: 'hello' } },
    }
    const response = await handleMcpHttpRequest({
      user,
      permissions: ['mcp.user:read'],
      request: new Request('http://localhost/api/v1/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      }),
      parsedBody: body,
      config: USER_MCP_SERVER_CONFIG,
    })

    expect(response.status).toBe(200)
  }, 15_000)
})
