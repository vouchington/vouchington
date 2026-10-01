import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { SCOPE_DEFINITIONS } from '@modules/scopes'
import { describe, expect, it } from 'vitest'

describe('GET /api/v1/scopes', () => {
  it('returns every canonical scope with a public cache header', async () => {
    const response = await createRequest().get('/api/v1/scopes').expect(200)

    expect(response.headers['cache-control']).toContain('public')
    const scopes = response.body.scopes as { scope: string }[]
    expect(scopes.map(entry => entry.scope)).toEqual(Object.keys(SCOPE_DEFINITIONS).toSorted())
    expect(scopes.find(entry => entry.scope === 'mcp.user:write')).toEqual({
      scope: 'mcp.user:write',
      resource: 'mcp.user',
      action: 'write',
      audience: 'user',
      description_key: 'mcp_user_full_access',
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

  it('returns stable nullable description keys', async () => {
    const response = await createRequest().get('/api/v1/scopes').expect(200)
    const scopes = response.body.scopes as { description_key: string | null; scope: string }[]

    expect(scopes.find(entry => entry.scope === 'mcp.admin:read')?.description_key).toBe(
      'mcp_admin_full_access',
    )
    expect(scopes.find(entry => entry.scope === 'rss:read')?.description_key).toBeNull()
  })
})
