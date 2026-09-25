import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  buildOAuthAuthorizationServerMetadata,
  buildOAuthProtectedResourceMetadata,
} from '@services/oauth-authorization-server'

describe('OAuth discovery documents', () => {
  it.each([
    ['/.well-known/oauth-authorization-server', buildOAuthAuthorizationServerMetadata()],
    [
      '/.well-known/oauth-protected-resource/api/v1/mcp',
      buildOAuthProtectedResourceMetadata('user'),
    ],
    [
      '/.well-known/oauth-protected-resource/api/v1/admin/mcp',
      buildOAuthProtectedResourceMetadata('admin'),
    ],
  ])('serves %s anonymously as cacheable JSON', async (path, document) => {
    const response = await createRequest().get(path).expect(200)

    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.headers['cache-control']).toContain('public')
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(response.body).toEqual(document)
  })

  it('has no root protected-resource document because two resources share this origin', async () => {
    await createRequest().get('/.well-known/oauth-protected-resource').expect(404)
  })
})
