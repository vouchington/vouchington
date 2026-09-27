import { describe, expect, it } from 'vitest'
import { getOAuthClientDisplayName } from './known-clients.mts'

describe('known OAuth clients', () => {
  it('uses a reviewed name only for an exact known Client Identifier URL', () => {
    const metadataUrl = 'https://client.example/metadata.json'
    const knownClients = { [metadataUrl]: 'Reviewed client' }
    expect(getOAuthClientDisplayName(metadataUrl, knownClients)).toBe('Reviewed client')
    expect(getOAuthClientDisplayName(`${metadataUrl}?other`, knownClients)).toBe('client.example')
  })
})
