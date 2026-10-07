import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  buildOAuthAuthorizationServerMetadata,
  buildOAuthProtectedResourceMetadata,
  getNativeOAuthClientDocument,
  NATIVE_OAUTH_CLIENT_APPS,
} from '@services/oauth-authorization-server'

describe('OAuth discovery documents', () => {
  it('advertises Client ID Metadata Document support', () => {
    expect(buildOAuthAuthorizationServerMetadata()).toMatchObject({
      client_id_metadata_document_supported: true,
    })
  })

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

  it.each(NATIVE_OAUTH_CLIENT_APPS)(
    'serves the %s native client document anonymously',
    async app => {
      const document = getNativeOAuthClientDocument(app)
      const response = await createRequest().get(new URL(document.client_id).pathname).expect(200)
      expect(response.body).toEqual(document)
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['set-cookie']).toBeUndefined()
      expect(document.token_endpoint_auth_method).toBe('none')
      expect(document.redirect_uris).toEqual(
        app === 'windows'
          ? [
              'http://127.0.0.1/oauth/native/windows/callback',
              'http://[::1]/oauth/native/windows/callback',
            ]
          : [`${new URL(document.client_id).origin}/oauth/native/${app}/callback`],
      )
    },
  )

  it('does not serve an unknown native client', async () => {
    await createRequest().get('/api/v1/oauth/native-clients/other').expect(404)
  })
})
