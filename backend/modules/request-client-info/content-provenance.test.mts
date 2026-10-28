import { describe, expect, it } from 'vitest'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { getRequestContentProvenance } from './content-provenance.mts'
import {
  runWithCredentialRequestContext,
  runWithSessionRequestContext,
  type CredentialRequestOrigin,
  type RequestClientInfo,
} from './index.mts'

describe('getRequestContentProvenance origin mapping', () => {
  it.each<[string, RequestClientInfo['client'], ContentProvenance]>([
    ['web session', 'web', { createdVia: 'web', oauthClientId: null }],
    ['swift session', 'swift', { createdVia: 'swift', oauthClientId: null }],
    ['dotnet session', 'dotnet', { createdVia: 'dotnet', oauthClientId: null }],
  ])('maps a %s origin', (_name, client, expected) => {
    const clientInfo: RequestClientInfo = {
      client,
      platform: client === 'dotnet' ? 'windows' : client === 'swift' ? 'ios' : 'web',
      appVersion: 'test',
      deviceId: 'test',
      ipAddress: '::1',
    }
    expect(runWithSessionRequestContext(clientInfo, getRequestContentProvenance)).toEqual(expected)
  })

  it('rejects a session without client information', () => {
    expect(() => runWithSessionRequestContext(null, getRequestContentProvenance)).toThrow(
      expect.objectContaining({ status: 400, code: 'INVALID_CLIENT_INFO' }),
    )
  })

  it.each<[string, CredentialRequestOrigin, ContentProvenance]>([
    [
      'MCP API key',
      { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null },
      { createdVia: 'mcp', oauthClientId: null },
    ],
    [
      'MCP OAuth',
      { interface: 'mcp', credential: 'oauth', client: null, oauthClientId: 'client-id' },
      { createdVia: 'mcp', oauthClientId: 'client-id' },
    ],
    [
      'REST API key',
      { interface: 'rest', credential: 'api_key', client: null, oauthClientId: null },
      { createdVia: 'api', oauthClientId: null },
    ],
    [
      'REST OAuth',
      { interface: 'rest', credential: 'oauth', client: null, oauthClientId: 'client-id' },
      { createdVia: 'api', oauthClientId: 'client-id' },
    ],
  ])('maps a %s origin', (_name, origin, expected) => {
    expect(runWithCredentialRequestContext(origin, getRequestContentProvenance)).toEqual(expected)
  })
})

describe('getRequestContentProvenance', () => {
  it('returns the provenance of the current request', () => {
    const clientInfo = {
      client: 'dotnet',
      platform: 'windows',
      appVersion: 'test',
      deviceId: 'device',
      ipAddress: '::1',
    } as const
    expect(runWithSessionRequestContext(clientInfo, getRequestContentProvenance)).toEqual({
      createdVia: 'dotnet',
      oauthClientId: null,
    })
    const origin = {
      interface: 'mcp',
      credential: 'oauth',
      client: null,
      oauthClientId: 'client-id',
    } as const
    expect(runWithCredentialRequestContext(origin, getRequestContentProvenance)).toEqual({
      createdVia: 'mcp',
      oauthClientId: 'client-id',
    })
  })

  it('rejects content from a session request without client information', () => {
    expect(() => runWithSessionRequestContext(null, getRequestContentProvenance)).toThrow(
      expect.objectContaining({ status: 400, code: 'INVALID_CLIENT_INFO' }),
    )
  })

  it('treats a read outside a request as a programming error', () => {
    expect(() => getRequestContentProvenance()).toThrow(
      'Content provenance requested outside a request',
    )
  })
})
