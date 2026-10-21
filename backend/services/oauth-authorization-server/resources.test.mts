import { describe, expect, it } from 'vitest'
import { listScopeCatalog } from '@modules/scopes'
import { getSiteOrigin } from '@modules/utils'
import {
  buildOAuthAuthorizationServerMetadata,
  buildOAuthProtectedResourceMetadata,
  findOAuthProtectedResource,
  getOAuthIssuer,
  getOAuthResourceMetadataUrl,
  getOAuthResourceUrl,
} from './index.mts'

describe('OAuth protected resources', () => {
  it('derives every identifier from the configured site origin', () => {
    const issuer = new URL(getSiteOrigin()).origin

    expect(getOAuthIssuer()).toBe(issuer)
    expect(getOAuthResourceUrl('user')).toBe(`${issuer}/api/v1/mcp`)
    expect(getOAuthResourceUrl('admin')).toBe(`${issuer}/api/v1/admin/mcp`)
    expect(getOAuthResourceUrl('community_moderation')).toBe(
      `${issuer}/api/v1/community-moderation/mcp`,
    )
    expect(getOAuthResourceUrl('brand')).toBe(`${issuer}/api/v1/brand/mcp`)
    expect(getOAuthResourceUrl('legal')).toBe(`${issuer}/api/v1/legal/mcp`)
    expect(getOAuthResourceMetadataUrl('user')).toBe(
      `${issuer}/.well-known/oauth-protected-resource/api/v1/mcp`,
    )
    expect(getOAuthResourceMetadataUrl('admin')).toBe(
      `${issuer}/.well-known/oauth-protected-resource/api/v1/admin/mcp`,
    )
  })

  it('resolves only the exact canonical resource URLs', () => {
    expect(findOAuthProtectedResource(getOAuthResourceUrl('user'))).toEqual({
      audience: 'user',
      url: getOAuthResourceUrl('user'),
    })
    expect(findOAuthProtectedResource(getOAuthResourceUrl('admin'))).toEqual({
      audience: 'admin',
      url: getOAuthResourceUrl('admin'),
    })
    expect(findOAuthProtectedResource(getOAuthResourceUrl('legal'))?.audience).toBe('legal')
    expect(findOAuthProtectedResource(getOAuthResourceUrl('user').toUpperCase())).toBeNull()
  })

  it('publishes authorization-server metadata that advertises every OAuth scope', () => {
    const issuer = getOAuthIssuer()
    const metadata = buildOAuthAuthorizationServerMetadata()

    expect(metadata).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      revocation_endpoint: `${issuer}/revoke`,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    })
    // Registration accepts every `oauth`-surface scope, so each must be served by a protected
    // resource or an app could register a scope it can never be authorized for.
    expect(metadata.scopes_supported).toEqual(
      listScopeCatalog()
        .filter(entry => entry.surfaces.includes('oauth'))
        .map(entry => entry.scope),
    )
    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(['mcp.user:read', 'mcp.user:write', 'mcp.admin:read']),
    )
  })

  it('publishes protected-resource metadata scoped to one audience', () => {
    const user = buildOAuthProtectedResourceMetadata('user')
    const admin = buildOAuthProtectedResourceMetadata('admin')

    expect(user).toMatchObject({
      resource: getOAuthResourceUrl('user'),
      authorization_servers: [getOAuthIssuer()],
      bearer_methods_supported: ['header'],
    })
    expect(user.scopes_supported).toContain('mcp.user:write')
    expect(user.scopes_supported.some(scope => scope.startsWith('mcp.admin:'))).toBe(false)
    expect(admin.resource).toBe(getOAuthResourceUrl('admin'))
    expect(admin.scopes_supported).toContain('mcp.admin:read')
    expect(admin.scopes_supported.some(scope => scope.startsWith('mcp.user:'))).toBe(false)
    expect(admin.scopes_supported).not.toContain('copyright-notices:read')
    expect(buildOAuthProtectedResourceMetadata('community_moderation').scopes_supported).toEqual([
      'community-moderation:read',
      'community-moderation:write',
    ])
    expect(buildOAuthProtectedResourceMetadata('legal').scopes_supported).toEqual([
      'copyright-notices:read',
      'copyright-notices:write',
    ])
    expect(buildOAuthProtectedResourceMetadata('brand').scopes_supported).toEqual([
      'topic-claims:read',
      'topic-claims:write',
    ])
  })
})
