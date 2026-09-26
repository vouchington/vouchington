import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createInstanceFromHostname } from './create-instance.mts'
import { getFediverseInstanceAttributes } from './get-attributes.mts'
import { findExistingInstanceByHostnameId } from './find-existing-instance.mts'
import { resolveHostname } from '@services/topics/hostname-link'
import { FEDIVERSE_MASTODON_HOST } from '@voucha/config'
import { createTestUserDirect, softDeleteTopic, WEB_PROVENANCE } from '@voucha/test-helpers'

/* no-mistakes: integration=nodeinfo */
const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

// classifyFediverseInstance only classifies the exact FEDIVERSE_*_HOST config hosts (see
// instance-classification.mts) — an arbitrary/random hostname always degrades to
// unsupported_host with no fetch, so this test must submit one of those literal config hosts to
// exercise the classification-succeeds path through createInstanceFromHostname.
const HOST = FEDIVERSE_MASTODON_HOST
const NODEINFO_URL = `https://${HOST}/nodeinfo/2.0`

const WELL_KNOWN_DOCUMENT = {
  links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: NODEINFO_URL }],
}

const NODEINFO_DOCUMENT = {
  version: '2.0',
  software: { name: 'mastodon', version: '4.2.1' },
  protocols: ['activitypub'],
  openRegistrations: true,
  usage: { users: { total: 1000, activeMonth: 250 } },
}

describe('createInstanceFromHostname — classification-succeeds path', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('populates the extension row with classified NodeInfo metadata for a supported config host', async () => {
    const user = await createTestUserDirect()

    // The config host is a fixed literal (not a per-test random suffix, since
    // classifyFediverseInstance only recognizes this exact hostname) — clear any active instance
    // topic left behind by a prior dirty-DB test run so this test always exercises the create
    // path rather than degrading to upvote.
    const hostnameId = await resolveHostname(user.id, HOST)
    const existing = await findExistingInstanceByHostnameId(hostnameId!)
    if (existing) await softDeleteTopic(existing.topic_id, user.id)

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(WELL_KNOWN_DOCUMENT), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(NODEINFO_DOCUMENT), { status: 200 }))

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, HOST)
    expect(result.status).toBe('created')

    const attributes = await getFediverseInstanceAttributes(result.topic_id)
    expect(attributes).toMatchObject({
      software: 'mastodon',
      protocol: 'activitypub',
      nodeinfo_software_version: '4.2.1',
      total_users: 1000,
      monthly_active_users: 250,
      open_registrations: true,
      nodeinfo_raw: NODEINFO_DOCUMENT,
      integration_status: 'pending',
    })
  })
})
