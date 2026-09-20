import { describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { validateRegisteredMcpRequest } from './validate-registered-request.mts'

const callToolSafeParse = vi.hoisted(() =>
  vi.fn<(value: unknown) => { success: boolean }>(() => ({ success: false })),
)

vi.mock(import('@modelcontextprotocol/sdk/types.js'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    CallToolRequestSchema: {
      ...actual.CallToolRequestSchema,
      safeParse: callToolSafeParse,
    },
  }
})

describe('validateRegisteredMcpRequest', () => {
  it('uses a null id when a malformed registered request cannot be correlated', async () => {
    const request = { jsonrpc: '2.0', method: 'tools/call', params: { arguments: {} } }
    const response = validateRegisteredMcpRequest(request)

    expect(callToolSafeParse).toHaveBeenCalledWith(request)
    expect(response).not.toBeNull()
    const result = (await response?.json()) as { id?: unknown; error?: { code?: number } }
    expect(result).toHaveProperty('id', null)
    expect(result.error?.code).toBe(ErrorCode.InvalidRequest)
  })
})
