import { beforeAll, describe, expect, it } from 'vitest'
import { createApiKey } from '@services/api-keys'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('MCP HTTP response variants', () => {
  let credential: string

  beforeAll(async () => {
    const user = await createTestUser()
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Protocol response test', [
      'mcp.user:read',
    ])
    credential = rawKey
  })

  function post(payload: string | object) {
    return createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${credential}`)
      .send(payload)
  }

  it('preserves a bodyless notification response with no Content-Type', async () => {
    const response = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }).expect(202)
    expect(response.text).toBe('')
    expect(response.headers['content-type']).toBeUndefined()
  })

  it('keeps framework admission errors and nullable-id JSON-RPC errors at HTTP 400', async () => {
    const malformedJson = await post('{"jsonrpc":').expect(400)
    expect(malformedJson.body).toMatchObject({ message: 'Invalid JSON' })
    expect(malformedJson.headers['content-type']).toContain('application/json')

    const malformedMessage = await post({ jsonrpc: 'invalid', method: 'tools/list' }).expect(400)
    expect(malformedMessage.body).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: expect.any(Number) },
    })
    expect(malformedMessage.headers['content-type']).toContain('application/json')
  })
})
