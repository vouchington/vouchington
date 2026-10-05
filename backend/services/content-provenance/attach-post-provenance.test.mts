import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  clearTestOAuthClientVerified,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import { attachPostProvenance, labelAndMaskPosts } from './attach-post-provenance.mts'

const suffix = randomBytes(6).toString('hex')
const CIMD_URL = `https://agent-${suffix}.example/oauth/client.json`
const VERIFIED_NAME = `Verified Agent ${suffix}`

let author: PrivateUser
let reader: PrivateUser
let admin: PrivateUser
let moderator: PrivateUser
let verifiedClientId: string
let unverifiedClientId: string
let cimdClientId: string

const ids: Record<string, string> = {}
const created: Record<string, Post> = {}

async function seedPost(key: string, provenance: ContentProvenance, isAnonymous = false) {
  const post = await createTestPost({ user: author, provenance, is_anonymous: isAnonymous })
  ids[key] = post.id
  created[key] = post
  return post
}

type Labelled = Pick<Post, 'provenance' | 'staff_provenance'>

describe('attachPostProvenance', () => {
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
    unverifiedClientId = await insertContentProvenanceOAuthClient({})
    cimdClientId = await insertContentProvenanceOAuthClient({ metadataUrl: CIMD_URL })

    await seedPost('web', { createdVia: 'web', oauthClientId: null })
    await seedPost('system', { createdVia: 'system', oauthClientId: null })
    await seedPost('swift', { createdVia: 'swift', oauthClientId: null })
    await seedPost('dotnet', { createdVia: 'dotnet', oauthClientId: null })
    await seedPost('apiBare', { createdVia: 'api', oauthClientId: null })
    await seedPost('mcpUnverified', { createdVia: 'mcp', oauthClientId: unverifiedClientId })
    await seedPost('mcpVerified', { createdVia: 'mcp', oauthClientId: verifiedClientId })
    await seedPost('apiCimd', { createdVia: 'api', oauthClientId: cimdClientId })
    await seedPost('anonVerified', { createdVia: 'mcp', oauthClientId: verifiedClientId }, true)
  })

  const post = (key: string) => ({
    id: ids[key]!,
    is_anonymous: key === 'anonVerified',
    created_by_id: null as string | null,
  })
  const withAuthor = (key: string) => ({ ...post(key), created_by_id: author.id })
  const labelFor = async (key: string, viewer?: PrivateUser | null) =>
    (await attachPostProvenance([withAuthor(key)], viewer))[0] as Record<string, unknown>

  describe('attachPostProvenance: public label', () => {
    it.each([
      ['web', undefined],
      ['system', undefined],
      ['swift', undefined],
      ['dotnet', undefined],
      ['apiBare', { via: 'api', app_name: null }],
      ['mcpUnverified', { via: 'mcp', app_name: null }],
      ['mcpVerified', { via: 'mcp', app_name: VERIFIED_NAME }],
      ['apiCimd', { via: 'api', app_name: new URL(CIMD_URL).hostname }],
    ])('labels %s rows', async (key, expected) => {
      expect((await labelFor(key, null)).provenance).toEqual(expected)
    })

    it('never gives a signed-out, regular or author viewer the staff detail', async () => {
      for (const viewer of [null, undefined, reader, author]) {
        expect((await labelFor('mcpVerified', viewer)).staff_provenance).toBeUndefined()
      }
    })

    it('returns copies and leaves the cached posts untouched', async () => {
      const original = withAuthor('mcpVerified')
      const [labelled] = await attachPostProvenance([original], admin)
      expect(labelled).not.toBe(original)
      expect(original).not.toHaveProperty('provenance')
      expect(original).not.toHaveProperty('staff_provenance')
    })

    it('keeps missing entries and ids it cannot find in place', async () => {
      const unknown = { id: crypto.randomUUID(), is_anonymous: false, created_by_id: null }
      expect(await attachPostProvenance([null, undefined, unknown])).toEqual([
        null,
        undefined,
        unknown,
      ])
      expect(await attachPostProvenance([])).toEqual([])
    })

    it('shows a rename or an unverify on the very next read', async () => {
      const renamed = `Renamed ${suffix}`
      const rowId = await insertContentProvenanceOAuthClient({
        verifiedAt: new Date(),
        verifiedById: admin.id,
      })
      const mine = await seedPost('changing', { createdVia: 'api', oauthClientId: rowId })
      const read = async () =>
        (await attachPostProvenance([{ ...mine, created_by_id: author.id }], null))[0]?.provenance
      expect(await read()).toEqual({ via: 'api', app_name: 'Content provenance test client' })
      await renameTestOAuthClient(rowId, renamed)
      expect(await read()).toEqual({ via: 'api', app_name: renamed })
      await clearTestOAuthClientVerified(rowId)
      expect(await read()).toEqual({ via: 'api', app_name: null })
    })
  })

  describe('attachPostProvenance: staff detail', () => {
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
        oauth_client: { client_name: 'Content provenance test client', verified: false },
      })
      expect(await staff('apiCimd')).toMatchObject({
        oauth_client: { client_id: CIMD_URL, metadata_url: CIMD_URL, verified: false },
      })
    })
  })

  describe('attachPostProvenance: anonymous posts', () => {
    const anon = (viewer?: PrivateUser | null) =>
      attachPostProvenance([withAuthor('anonVerified')], viewer).then(rows => rows[0] as Labelled)

    it('keeps the app name from viewers who cannot see the author', async () => {
      for (const viewer of [null, reader]) {
        expect((await anon(viewer)).provenance).toEqual({ via: 'mcp', app_name: null })
      }
    })

    it('shows the app name to the author and to administrators', async () => {
      for (const viewer of [author, admin]) {
        expect((await anon(viewer)).provenance).toEqual({ via: 'mcp', app_name: VERIFIED_NAME })
      }
    })

    it('gives a moderator the channel but not the client behind an anonymous author', async () => {
      const staff = (await anon(moderator)).staff_provenance
      expect(staff).toEqual({ created_via: 'mcp' })
      expect(staff).not.toHaveProperty('oauth_client')
      expect((await anon(admin)).staff_provenance?.oauth_client?.client_name).toBe(VERIFIED_NAME)
    })

    it('decides before masking, so a masked author does not hide the label', async () => {
      const [masked] = await labelAndMaskPosts([created.anonVerified!], reader)
      expect(masked?.created_by_id).toBeNull()
      expect(masked).toMatchObject({ provenance: { via: 'mcp', app_name: null } })
      const [own] = await labelAndMaskPosts([created.anonVerified!], author)
      expect(own).toMatchObject({
        created_by_id: author.id,
        provenance: { app_name: VERIFIED_NAME },
      })
    })
  })
})
