import { describe, expect, it } from 'vitest'
import { getSiteOrigin } from '@modules/utils'
import {
  assertScopesMatchResource,
  assertTokenRequestResource,
  buildOAuthAuthorizationServerMetadata,
  buildOAuthProtectedResourceMetadata,
  findOAuthProtectedResource,
  getOAuthIssuer,
  getOAuthResourceMetadataUrl,
  getOAuthResourceUrl,
  validateResource,
} from './index.mts'

describe('OAuth protected resources', () => {
  it('derives every identifier from the configured site origin', () => {
    const issuer = new URL(getSiteOrigin()).origin

    expect(getOAuthIssuer()).toBe(issuer)
    expect(getOAuthResourceUrl('user')).toBe(`${issuer}/api/v1/mcp`)
    expect(getOAuthResourceUrl('admin')).toBe(`${issuer}/api/v1/admin/mcp`)
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
    expect(validateResource(getOAuthResourceUrl('admin'))).toEqual({
      audience: 'admin',
      url: getOAuthResourceUrl('admin'),
    })
    expect(findOAuthProtectedResource(getOAuthResourceUrl('user').toUpperCase())).toBeNull()
  })

  it('accepts a token-endpoint resource only when it names the bound resource', () => {
    const bound = getOAuthResourceUrl('user')

    expect(() => assertTokenRequestResource(undefined, bound)).not.toThrow()
    expect(() => assertTokenRequestResource(bound, bound)).not.toThrow()
    expect(() => assertTokenRequestResource(getOAuthResourceUrl('admin'), bound)).toThrowError(
      expect.objectContaining({ code: 'invalid_target' }),
    )
  })

  it('rejects scopes whose audience differs from the requested resource', () => {
    const user = validateResource(getOAuthResourceUrl('user'))
    const admin = validateResource(getOAuthResourceUrl('admin'))

    expect(() => assertScopesMatchResource(['mcp.user:read'], user)).not.toThrow()
    expect(() => assertScopesMatchResource(['mcp.admin:read'], admin)).not.toThrow()
    expect(() => assertScopesMatchResource(['mcp.user:read'], admin)).toThrowError(
      expect.objectContaining({ code: 'invalid_scope' }),
    )
    expect(() => assertScopesMatchResource(['mcp.admin:read'], user)).toThrowError(
      expect.objectContaining({ code: 'invalid_scope' }),
    )
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
    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(['mcp.user:read', 'mcp.user:write', 'mcp.admin:read']),
    )
    expect(metadata.scopes_supported).toEqual([...metadata.scopes_supported].sort())
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
  })
})
