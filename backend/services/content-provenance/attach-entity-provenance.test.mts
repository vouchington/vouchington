import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestList,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  clearTestOAuthClientVerified,
  getTestOAuthClientPublicId,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import {
  attachCommunityProvenance,
  attachListProvenance,
  attachRssFeedProvenance,
  attachTopicProvenance,
  attachWrittenCommunityProvenance,
  attachWrittenListProvenance,
  attachWrittenRssFeedProvenance,
  attachWrittenTopicProvenance,
} from './attach-entity-provenance.mts'

const suffix = randomBytes(6).toString('hex')
const CIMD_URL = `https://agent-${suffix}.example/oauth/client.json`
const VERIFIED_NAME = `Verified Agent ${suffix}`
const UNVERIFIED_NAME = 'Content provenance test client'

type Entity = { id: string; provenance?: unknown; staff_provenance?: unknown }
type Attach = (entities: Entity[], viewer?: PrivateUser | null) => Promise<Entity[]>
type AttachWritten = (entity: Entity, viewer: PrivateUser | null) => Promise<Entity>

let author: PrivateUser
let reader: PrivateUser
let admin: PrivateUser
let moderator: PrivateUser
let verifiedClientId: string
let verifiedPublicId: string
let unverifiedClientId: string
let cimdClientId: string

const KINDS: Array<{
  name: string
  attach: Attach
  attachWritten: AttachWritten
  seed: (provenance: ContentProvenance) => Promise<string>
}> = [
  {
    name: 'community',
    attach: attachCommunityProvenance as Attach,
    attachWritten: attachWrittenCommunityProvenance as AttachWritten,
    seed: async provenance =>
      (await insertTestCommunity({ createdById: author.id, provenance })).id,
  },
  {
    name: 'topic',
    attach: attachTopicProvenance as Attach,
    attachWritten: attachWrittenTopicProvenance as AttachWritten,
    seed: async provenance => (await createTestTopic({ user: author, provenance })).id,
  },
  {
    name: 'list',
    attach: attachListProvenance as Attach,
    attachWritten: attachWrittenListProvenance as AttachWritten,
    seed: async provenance =>
      (await insertTestList({ ownerUserId: author.id, name: `List ${suffix}`, provenance })).id,
  },
  {
    name: 'rss feed',
    attach: attachRssFeedProvenance as Attach,
    attachWritten: attachWrittenRssFeedProvenance as AttachWritten,
    seed: async provenance => (await insertTestRssFeedDirect({ provenance })).id,
  },
]

const ROWS = [
  'web',
  'system',
  'swift',
  'dotnet',
  'apiBare',
  'mcpUnverified',
  'mcpVerified',
  'apiCimd',
]

describe('attach entity provenance', () => {
  beforeAll(async () => {
    ;[author, reader, admin, moderator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    verifiedClientId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(verifiedClientId, VERIFIED_NAME)
    verifiedPublicId = await getTestOAuthClientPublicId(verifiedClientId)
    unverifiedClientId = await insertContentProvenanceOAuthClient({})
    cimdClientId = await insertContentProvenanceOAuthClient({ metadataUrl: CIMD_URL })
  })

  describe.each(KINDS)('attach $name provenance', ({ attach, attachWritten, seed }) => {
    const ids: Record<string, string> = {}

    beforeAll(async () => {
      const provenance: Record<string, ContentProvenance> = {
        web: { createdVia: 'web', oauthClientId: null },
        system: { createdVia: 'system', oauthClientId: null },
        swift: { createdVia: 'swift', oauthClientId: null },
        dotnet: { createdVia: 'dotnet', oauthClientId: null },
        apiBare: { createdVia: 'api', oauthClientId: null },
        mcpUnverified: { createdVia: 'mcp', oauthClientId: unverifiedClientId },
        mcpVerified: { createdVia: 'mcp', oauthClientId: verifiedClientId },
        apiCimd: { createdVia: 'api', oauthClientId: cimdClientId },
      }
      await Promise.all(ROWS.map(async key => (ids[key] = await seed(provenance[key]!))))
    })

    const labelFor = async (key: string, viewer?: PrivateUser | null) =>
      (await attach([{ id: ids[key]! }], viewer))[0]!

    it.each([
      ['web', undefined],
      ['system', undefined],
      ['swift', undefined],
      ['dotnet', undefined],
      ['apiBare', { via: 'api', app: null }],
      ['mcpUnverified', { via: 'mcp', app: null }],
      ['apiCimd', { via: 'api', app: { kind: 'hostname', hostname: new URL(CIMD_URL).hostname } }],
    ])('labels %s rows for a signed-out reader', async (key, expected) => {
      expect((await labelFor(key, null)).provenance).toEqual(expected)
    })

    it('labels a staff-verified client with its id and registered name', async () => {
      expect((await labelFor('mcpVerified', null)).provenance).toEqual({
        via: 'mcp',
        app: { kind: 'verified', client_id: verifiedPublicId, client_name: VERIFIED_NAME },
      })
    })

    it('never gives a signed-out, regular or creator viewer the staff detail', async () => {
      for (const viewer of [null, undefined, reader, author]) {
        expect((await labelFor('mcpVerified', viewer)).staff_provenance).toBeUndefined()
      }
    })

    it.each([
      ['administrator', () => admin],
      ['moderator', () => moderator],
    ])('shows every channel and the raw OAuth client to a %s', async (_role, viewer) => {
      const staff = (key: string) => labelFor(key, viewer()).then(row => row.staff_provenance)
      for (const channel of ['web', 'system', 'swift', 'dotnet']) {
        expect(await staff(channel)).toEqual({ created_via: channel, oauth_client: null })
      }
      expect(await staff('apiBare')).toEqual({ created_via: 'api', oauth_client: null })
      expect(await staff('mcpVerified')).toEqual({
        created_via: 'mcp',
        oauth_client: {
          client_id: expect.stringMatching(/^voucha_/),
          client_name: VERIFIED_NAME,
          metadata_url: null,
          verified: true,
        },
      })
      expect(await staff('mcpUnverified')).toMatchObject({
        oauth_client: { client_name: UNVERIFIED_NAME, verified: false },
      })
      expect(await staff('apiCimd')).toMatchObject({
        oauth_client: { client_id: CIMD_URL, metadata_url: CIMD_URL, verified: false },
      })
    })

    it('returns copies and leaves the cached entities untouched', async () => {
      const original = { id: ids.mcpVerified! }
      const [labelled] = await attach([original], admin)
      expect(labelled).not.toBe(original)
      expect(original).not.toHaveProperty('provenance')
      expect(original).not.toHaveProperty('staff_provenance')
    })

    it('keeps missing entries and ids it cannot find in place, and labels each id once', async () => {
      const unknown = { id: crypto.randomUUID() }
      expect(await attach([null, undefined, unknown] as unknown as Entity[])).toEqual([
        null,
        undefined,
        unknown,
      ])
      expect(await attach([])).toEqual([])
      const [first, again] = await attach([{ id: ids.apiBare! }, { id: ids.apiBare! }])
      expect(first).toEqual(again)
      expect(first?.provenance).toEqual({ via: 'api', app: null })
    })

    it('shows a rename or an unverify on the very next read', async () => {
      const rowId = await insertContentProvenanceOAuthClient({
        verifiedAt: new Date(),
        verifiedById: admin.id,
      })
      const publicId = await getTestOAuthClientPublicId(rowId)
      const mine = await seed({ createdVia: 'api', oauthClientId: rowId })
      const read = async () => (await attach([{ id: mine }], null))[0]?.provenance
      const verified = (client_name: string) => ({
        via: 'api',
        app: { kind: 'verified', client_id: publicId, client_name },
      })
      expect(await read()).toEqual(verified(UNVERIFIED_NAME))
      await renameTestOAuthClient(rowId, `Renamed ${suffix}`)
      expect(await read()).toEqual(verified(`Renamed ${suffix}`))
      await clearTestOAuthClientVerified(rowId)
      expect(await read()).toEqual({ via: 'api', app: null })
    })

    it('labels a freshly written entity from the primary', async () => {
      const fresh = await seed({ createdVia: 'mcp', oauthClientId: unverifiedClientId })
      const written = await attachWritten({ id: fresh }, moderator)
      expect(written).toMatchObject({
        provenance: { via: 'mcp', app: null },
        staff_provenance: { created_via: 'mcp' },
      })
      expect(await attachWritten({ id: fresh }, null)).not.toHaveProperty('staff_provenance')
    })
  })
})
