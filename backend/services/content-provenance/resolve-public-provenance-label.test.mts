import { describe, expect, it } from 'vitest'
import type { ContentCreationChannel } from '@voucha/types/entities/content-provenance'
import {
  buildStaffProvenance,
  resolvePublicProvenanceLabel,
  type ProvenanceClient,
} from './resolve-public-provenance-label.mts'

const REVIEWED_URL = 'https://reviewed.example/oauth/client.json'
const KNOWN = { [REVIEWED_URL]: 'Reviewed App' }
const VERIFIED_AT = new Date('2026-01-02T03:04:05Z')

function client(overrides: Partial<ProvenanceClient>): ProvenanceClient {
  return {
    client_id: 'voucha_client',
    client_name: 'Registered Name',
    metadata_url: null,
    verified_at: null,
    ...overrides,
  }
}

const allowlistedCimd = client({ client_id: REVIEWED_URL, metadata_url: REVIEWED_URL })
const unlistedCimd = client({
  client_id: 'https://other.example/a/b.json?x=1',
  client_name: 'Self Described',
  metadata_url: 'https://other.example/a/b.json?x=1',
})
const verifiedDynamic = client({ verified_at: VERIFIED_AT })
const unverifiedDynamic = client({})

describe('resolvePublicProvenanceLabel', () => {
  it.each(['api', 'mcp'] as const)('labels %s rows by the four tiers', via => {
    const resolve = (c: ProvenanceClient | null | undefined) =>
      resolvePublicProvenanceLabel(via, c, KNOWN)

    // Tier 1: CIMD client on the reviewed allowlist.
    expect(resolve(allowlistedCimd)).toEqual({ via, app_name: 'Reviewed App' })
    // Tier 2: any other CIMD client gets the metadata hostname, never its self-described name.
    expect(resolve(unlistedCimd)).toEqual({ via, app_name: 'other.example' })
    // Tier 3: a dynamically registered client only counts once staff verified it.
    expect(resolve(verifiedDynamic)).toEqual({ via, app_name: 'Registered Name' })
    // Tier 4: everything else is the plain channel.
    expect(resolve(unverifiedDynamic)).toEqual({ via, app_name: null })
    expect(resolve(null)).toEqual({ via, app_name: null })
    expect(resolve(undefined)).toEqual({ via, app_name: null })
  })

  it('does not trust a verified timestamp over a CIMD client', () => {
    const verifiedCimd = { ...unlistedCimd, verified_at: VERIFIED_AT }
    expect(resolvePublicProvenanceLabel('mcp', verifiedCimd, KNOWN)).toEqual({
      via: 'mcp',
      app_name: 'other.example',
    })
  })

  it('uses an exact allowlist match only', () => {
    const nearMiss = client({ metadata_url: `${REVIEWED_URL}?other` })
    expect(resolvePublicProvenanceLabel('api', nearMiss, KNOWN)).toEqual({
      via: 'api',
      app_name: 'reviewed.example',
    })
  })

  it('ships with an empty allowlist, so every CIMD client shows its hostname', () => {
    expect(resolvePublicProvenanceLabel('mcp', allowlistedCimd)).toEqual({
      via: 'mcp',
      app_name: 'reviewed.example',
    })
  })

  it.each(['web', 'swift', 'dotnet', 'system'] as const)(
    'never labels %s rows, even with a verified client',
    via => {
      expect(resolvePublicProvenanceLabel(via, null, KNOWN)).toBeNull()
      expect(resolvePublicProvenanceLabel(via, verifiedDynamic, KNOWN)).toBeNull()
      expect(resolvePublicProvenanceLabel(via, allowlistedCimd, KNOWN)).toBeNull()
    },
  )
})

describe('buildStaffProvenance', () => {
  it.each(['web', 'swift', 'dotnet', 'api', 'mcp', 'system'] as ContentCreationChannel[])(
    'carries the %s channel without a client',
    via => {
      expect(buildStaffProvenance(via, null)).toEqual({ created_via: via, oauth_client: null })
    },
  )

  it('carries the raw client and whether staff verified it', () => {
    expect(buildStaffProvenance('mcp', verifiedDynamic)).toEqual({
      created_via: 'mcp',
      oauth_client: {
        client_id: 'voucha_client',
        client_name: 'Registered Name',
        metadata_url: null,
        verified: true,
      },
    })
    expect(buildStaffProvenance('api', unlistedCimd).oauth_client).toMatchObject({
      client_id: 'https://other.example/a/b.json?x=1',
      client_name: 'Self Described',
      metadata_url: 'https://other.example/a/b.json?x=1',
      verified: false,
    })
  })
})
