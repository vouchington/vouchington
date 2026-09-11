import { describe, expect, it } from 'vitest'
import { findNodeInfoSchema2Link, mapNodeInfoDocument } from './instance-classification.mts'

const SCHEMA_2_0_HREF = 'https://mastodon.example/nodeinfo/2.0'

describe('findNodeInfoSchema2Link', () => {
  it('returns the href of the schema 2.0 link among several advertised versions', () => {
    const href = findNodeInfoSchema2Link({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/1.0',
          href: 'https://mastodon.example/nodeinfo/1.0',
        },
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: SCHEMA_2_0_HREF },
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: 'https://mastodon.example/nodeinfo/2.1',
        },
      ],
    })

    expect(href).toBe(SCHEMA_2_0_HREF)
  })

  it('returns null when the links array is missing', () => {
    expect(findNodeInfoSchema2Link({})).toBeNull()
  })

  it('returns null when the document is not an object', () => {
    expect(findNodeInfoSchema2Link(null)).toBeNull()
    expect(findNodeInfoSchema2Link('not-json')).toBeNull()
    expect(findNodeInfoSchema2Link(undefined)).toBeNull()
  })

  it('returns null when links is present but contains no schema 2.0 entry', () => {
    const href = findNodeInfoSchema2Link({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/1.0',
          href: 'https://mastodon.example/nodeinfo/1.0',
        },
      ],
    })

    expect(href).toBeNull()
  })

  it('skips malformed link entries (missing href, non-string href, non-object entries)', () => {
    const href = findNodeInfoSchema2Link({
      links: [
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0' },
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: 42 },
        'not-a-link-object',
        null,
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: SCHEMA_2_0_HREF },
      ],
    })

    expect(href).toBe(SCHEMA_2_0_HREF)
  })
})

describe('mapNodeInfoDocument', () => {
  it('maps a full NodeInfo 2.0 document', () => {
    const metadata = mapNodeInfoDocument({
      version: '2.0',
      software: { name: 'mastodon', version: '4.2.1' },
      protocols: ['activitypub'],
      openRegistrations: true,
      usage: { users: { total: 12_345, activeMonth: 6_789 } },
    })

    expect(metadata).toEqual({
      software: 'mastodon',
      protocol: 'activitypub',
      nodeinfo_software_version: '4.2.1',
      total_users: 12_345,
      monthly_active_users: 6_789,
      open_registrations: true,
      nodeinfo_raw: {
        version: '2.0',
        software: { name: 'mastodon', version: '4.2.1' },
        protocols: ['activitypub'],
        openRegistrations: true,
        usage: { users: { total: 12_345, activeMonth: 6_789 } },
      },
    })
  })

  it('degrades usage fields to null when usage stats are missing entirely', () => {
    const metadata = mapNodeInfoDocument({
      software: { name: 'lemmy', version: '0.19.0' },
      protocols: ['activitypub'],
      openRegistrations: false,
    })

    expect(metadata.total_users).toBeNull()
    expect(metadata.monthly_active_users).toBeNull()
    expect(metadata.software).toBe('lemmy')
    expect(metadata.open_registrations).toBe(false)
  })

  it('degrades usage.users fields to null individually when only one is present', () => {
    const metadata = mapNodeInfoDocument({
      software: { name: 'peertube' },
      usage: { users: { total: 500 } },
    })

    expect(metadata.total_users).toBe(500)
    expect(metadata.monthly_active_users).toBeNull()
  })

  it('truncates non-integer numeric usage values', () => {
    const metadata = mapNodeInfoDocument({
      usage: { users: { total: 100.9, activeMonth: Number.NaN } },
    })

    expect(metadata.total_users).toBe(100)
    expect(metadata.monthly_active_users).toBeNull()
  })

  it('returns all-null fields and a null nodeinfo_raw for a malformed (non-object) document', () => {
    expect(mapNodeInfoDocument(null)).toEqual({
      software: null,
      protocol: null,
      nodeinfo_software_version: null,
      total_users: null,
      monthly_active_users: null,
      open_registrations: null,
      nodeinfo_raw: null,
    })

    expect(mapNodeInfoDocument('not-json').nodeinfo_raw).toBeNull()
    expect(mapNodeInfoDocument(undefined).nodeinfo_raw).toBeNull()
  })

  it('degrades individual fields to null when present with the wrong type', () => {
    const metadata = mapNodeInfoDocument({
      software: { name: 42, version: null },
      protocols: 'activitypub',
      openRegistrations: 'yes',
      usage: { users: { total: '100' } },
    })

    expect(metadata).toEqual({
      software: null,
      protocol: null,
      nodeinfo_software_version: null,
      total_users: null,
      monthly_active_users: null,
      open_registrations: null,
      nodeinfo_raw: {
        software: { name: 42, version: null },
        protocols: 'activitypub',
        openRegistrations: 'yes',
        usage: { users: { total: '100' } },
      },
    })
  })

  it('falls back to an empty protocol when the protocols array is empty', () => {
    const metadata = mapNodeInfoDocument({ protocols: [] })
    expect(metadata.protocol).toBeNull()
  })
})
