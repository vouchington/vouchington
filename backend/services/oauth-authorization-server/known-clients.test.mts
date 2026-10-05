import { describe, expect, it } from 'vitest'
import {
  getKnownOAuthClient,
  getOAuthClientDisplayName,
  KNOWN_OAUTH_CLIENTS,
  type KnownOAuthClients,
} from './known-clients.mts'

// Letters and digits with single hyphens between words: the shape each client's localization
// catalog keys its display copy by.
const KEY_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

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

  it('keeps every shipped entry keyed by a lowercase slug and named for the consent screens', () => {
    const entries = Object.values<{ key: string; name: string }>(KNOWN_OAUTH_CLIENTS)
    expect(entries.filter(({ key }) => !KEY_SLUG_PATTERN.test(key))).toEqual([])
    expect(entries.filter(({ name }) => name.trim() === '')).toEqual([])
  })
})
