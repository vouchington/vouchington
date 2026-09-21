/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This pure schema-boundary test uses the DB/Valkey-free project selected by the .no-data.mock suffix. */
import { describe, expect, it } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { validateRegisteredMcpRequest } from './validate-registered-request.mts'

describe('validateRegisteredMcpRequest', () => {
  it('uses a null id when a malformed registered request cannot be correlated', async () => {
    const request = { jsonrpc: '2.0', method: 'tools/call', params: { arguments: {} } }
    const response = validateRegisteredMcpRequest(request)

    expect(response).not.toBeNull()
    const result = (await response?.json()) as { id?: unknown; error?: { code?: number } }
    expect(result).toHaveProperty('id', null)
    expect(result.error?.code).toBe(ErrorCode.InvalidRequest)
  })
})
