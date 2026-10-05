import { describe, expect, it } from 'vitest'
import {
  getKnownOAuthClient,
  getOAuthClientDisplayName,
  isKnownOAuthClientKey,
  KNOWN_OAUTH_CLIENTS,
  type KnownOAuthClients,
} from './known-clients.mts'

const metadataUrl = 'https://client.example/metadata.json'
const knownClients: KnownOAuthClients = {
  [metadataUrl]: { key: 'reviewed-client', name: 'Reviewed client' },
}

describe('known OAuth clients', () => {
  it('uses a reviewed name only for an exact known Client Identifier URL', () => {
    expect(getOAuthClientDisplayName(metadataUrl, knownClients)).toBe('Reviewed client')
    expect(getOAuthClientDisplayName(`${metadataUrl}?other`, knownClients)).toBe('client.example')
  })

  it('finds a reviewed client by its exact Client Identifier URL only', () => {
    expect(getKnownOAuthClient(metadataUrl, knownClients)).toEqual({
      key: 'reviewed-client',
      name: 'Reviewed client',
    })
    expect(getKnownOAuthClient(`${metadataUrl}?other`, knownClients)).toBeNull()
  })

  it.each(['agent', 'agent-2', 'my-agent', 'a1-b2-c3'])('accepts %j as a key', key => {
    expect(isKnownOAuthClientKey(key)).toBe(true)
  })

  it.each(['', 'Agent', 'my agent', 'my_agent', '-agent', 'agent-', 'my--agent', '2agent', 'é'])(
    'rejects %j as a key',
    key => {
      expect(isKnownOAuthClientKey(key)).toBe(false)
    },
  )

  it('keeps every shipped entry keyed by a lowercase slug and named for the consent screens', () => {
    const entries = Object.values<{ key: string; name: string }>(KNOWN_OAUTH_CLIENTS)
    expect(entries.filter(({ key }) => !isKnownOAuthClientKey(key))).toEqual([])
    expect(entries.filter(({ name }) => name.trim() === '')).toEqual([])
  })
})
