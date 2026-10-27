import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
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

  const post = (body: unknown, config: McpServerConfig = USER_MCP_SERVER_CONFIG) =>
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
      rateLimitedCalls: new Map(),
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
      expect(json.result?.instructions).toBe(MCP_SERVER_INSTRUCTIONS[config.audience])
    },
  )

  it('returns a Response for tools/list request', async () => {
    const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { tools?: unknown[] } }
    expect(Array.isArray(json.result?.tools)).toBe(true)
  })

  it('refuses a rate-limited call in-band with the explanation and never runs the tool', async () => {
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'discover_topics')
    if (!tool) throw new Error('Expected discover_topics tool')
    const invoke = vi.spyOn(tool, 'function')
    const body = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'discover_topics', arguments: {} },
    }
    try {
      const response = await handleMcpHttpRequest({
        user,
        permissions: ['mcp.user:read'],
        request: new Request(`http://localhost${USER_MCP_SERVER_CONFIG.routePath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify(body),
        }),
        parsedBody: body,
        config: USER_MCP_SERVER_CONFIG,
        rateLimitedCalls: new Map([[0, { retryAfterSeconds: 7, message: 'Split the batch.' }]]),
      })
      const json = (await response.json()) as {
        result: { isError: boolean; content: { text: string }[] }
      }
      expect(json.result.isError).toBe(true)
      expect(JSON.parse(json.result.content[0].text).error).toMatchObject({
        message: 'Split the batch.',
        retryAfterSeconds: 7,
      })
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
      params: {
        name: 'discover_topics',
        arguments: optionArgs('search', { text_search_query: 'hello' }),
      },
    })

    expect(response.status).toBe(200)
    const json = (await response.json()) as { result?: { isError?: boolean } }
    expect(json.result?.isError).not.toBe(true)
  })
})
