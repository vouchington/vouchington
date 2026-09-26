import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { SCOPE_DEFINITIONS } from '@modules/scopes'
import { describe, expect, it } from 'vitest'

describe('GET /api/v1/scopes', () => {
  it('returns every canonical scope with a public cache header', async () => {
    const response = await createRequest().get('/api/v1/scopes').expect(200)

    expect(response.headers['cache-control']).toContain('public')
    const scopes = response.body.scopes as { scope: string }[]
    expect(scopes.map(entry => entry.scope)).toEqual(Object.keys(SCOPE_DEFINITIONS).sort())
    expect(scopes.find(entry => entry.scope === 'mcp.user:write')).toEqual({
      scope: 'mcp.user:write',
      resource: 'mcp.user',
      action: 'write',
      audience: 'user',
      requires: 'mcp.user:read',
      surfaces: ['api-key', 'oauth'],
    })
  })

  it('does not mark a signed-in response as publicly cacheable', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    const response = await request.get('/api/v1/scopes').expect(200)

    expect(response.headers['cache-control'] ?? '').not.toContain('public')
    expect(response.body.scopes).toHaveLength(Object.keys(SCOPE_DEFINITIONS).length)
  })
})
