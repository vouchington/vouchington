import { describe, expect, it } from 'vitest'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { planMcpCalls } from './classify-calls.mts'
import { BRAND_MCP_SERVER_CONFIG } from './config.mts'

describe('brand MCP server scope gate', () => {
  it('refuses a credential that lacks topic-claim scopes', () => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      roles: [] as const,
      membership_plan: null,
    }
    const call = (name: string, option: string, args: Record<string, unknown>) =>
      planMcpCalls(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: optionArgs(option, args) },
        },
        user,
        [],
        BRAND_MCP_SERVER_CONFIG,
      )
    expect(call('read_my_topic_claims', 'list', {}).events[0]?.outcome).toBe('insufficient_scope')
    expect(
      call('manage_topic_claim', 'create', { topic: 'topic', claimed_role: 'Issuer' }).events[0]
        ?.outcome,
    ).toBe('insufficient_scope')
  })
})
