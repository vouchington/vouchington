import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestList,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  getTestOAuthClientPublicId,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'

type Body = Record<string, any>
type Viewer = PrivateUser | undefined
type Seed = (name: string, slug: string, provenance: ContentProvenance) => Promise<string>

const suffix = randomBytes(6).toString('hex')
const APP_NAME = `Entity Agent ${suffix}`
const KEYS = ['mcp', 'api', 'web', 'swift', 'dotnet', 'system'] as const
type Key = (typeof KEYS)[number]

let author: PrivateUser
let admin: PrivateUser
let moderator: PrivateUser
let reader: PrivateUser
let clientRowId: string
let clientPublicId: string

const verifiedLabel = () => ({
  via: 'mcp',
  app: { kind: 'verified', client_id: clientPublicId, client_name: APP_NAME },
})

const as = async (viewer: Viewer) => {
  const request = createRequest()
  if (viewer) await request.authenticateAs(viewer)
  return request
}

const ENTITIES: Array<{
  name: string
  seed: (user: PrivateUser) => Seed
  detailPath: (id: string, slug: string) => string
  detail: (body: Body) => Body
  listPath: string
  listViewer?: () => Viewer
  fromList: (body: Body, id: string) => Body | undefined
}> = [
  {
    name: 'community',
    seed: user => async (name, slug, provenance) =>
      (await insertTestCommunity({ createdById: user.id, name, slug, provenance })).id,
    detailPath: (_id, slug) => `/api/v1/communities/${slug}`,
    detail: body => body.community,
    listPath: `/api/v1/communities?q=Entity+${suffix}&limit=50`,
    fromList: (body, id) => body.communities[id],
  },
  {
    name: 'topic',
    seed: user => (name, slug, provenance) =>
      insertTestTopic({ createdById: user.id, name, slug, provenance }),
    detailPath: id => `/api/v1/topics/${id}`,
    detail: body => body.topic,
    listPath: `/api/v1/topics?q=Entity+${suffix}&limit=50`,
    fromList: (body, id) => body.topics[id],
  },
  {
    name: 'list',
    seed: user => async (name, _slug, provenance) =>
      (
        await insertTestList({
          ownerUserId: user.id,
          name,
          visibility: 'public',
          provenance,
        })
      ).id,
    detailPath: id => `/api/v1/lists/${id}`,
    detail: body => body.list,
    listPath: '/api/v1/lists?limit=100',
    listViewer: () => author,
    fromList: (body, id) => body.lists[id],
  },
  {
    name: 'rss feed',
    seed: () => async (title, _slug, provenance) =>
      (await insertTestRssFeedDirect({ title, provenance })).id,
    detailPath: id => `/api/v1/rss-feeds/${id}`,
    detail: body => body.rss_feed,
    listPath: `/api/v1/rss-feeds?q=Entity+${suffix}&limit=25`,
    fromList: (body, id) => body.results.find((row: Body) => row.id === id),
  },
]

describe.each(ENTITIES)('$name provenance on read routes', entity => {
  const ids = {} as Record<Key, string>
  const slugs = {} as Record<Key, string>

  const read = async (key: Key, viewer?: Viewer) =>
    entity.detail(
      (await (await as(viewer)).get(entity.detailPath(ids[key], slugs[key])).expect(200)).body,
    )

  beforeAll(async () => {
    ;[author, admin, moderator, reader] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    clientRowId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(clientRowId, APP_NAME)
    clientPublicId = await getTestOAuthClientPublicId(clientRowId)
    const seed = entity.seed(author)
    await Promise.all(
      KEYS.map(async key => {
        slugs[key] = `entity-${key}-${suffix}-${entity.name.replace(' ', '-')}`
        const provenance: ContentProvenance =
          key === 'mcp'
            ? { createdVia: 'mcp', oauthClientId: clientRowId }
            : { createdVia: key, oauthClientId: null }
        ids[key] = await seed(`Entity ${suffix} ${key}`, slugs[key], provenance)
      }),
    )
  })

  describe('the detail route', () => {
    it('labels api and mcp rows for a signed-out reader', async () => {
      expect((await read('mcp')).provenance).toEqual(verifiedLabel())
      expect((await read('api')).provenance).toEqual({ via: 'api', app: null })
    })

    it.each(['web', 'swift', 'dotnet', 'system'] as const)(
      'has no label on a %s row',
      async key => {
        const row = await read(key)
        expect(row).not.toHaveProperty('provenance')
        expect(row).not.toHaveProperty('staff_provenance')
      },
    )

    it('gives a signed-out, regular or creator viewer only the public facts', async () => {
      for (const viewer of [undefined, reader, author]) {
        const row = await read('mcp', viewer)
        expect(row).not.toHaveProperty('staff_provenance')
        expect(row.provenance).toEqual(verifiedLabel())
        expect(JSON.stringify(row)).not.toContain('metadata_url')
      }
    })

    it.each([
      ['administrator', () => admin],
      ['moderator', () => moderator],
    ])('shows a %s every channel and the raw OAuth client', async (_role, viewer) => {
      expect((await read('mcp', viewer())).staff_provenance).toEqual({
        created_via: 'mcp',
        oauth_client: {
          client_id: expect.stringMatching(/^voucha_/),
          client_name: APP_NAME,
          metadata_url: null,
          verified: true,
        },
      })
      for (const key of ['web', 'swift', 'dotnet', 'system'] as const) {
        expect((await read(key, viewer())).staff_provenance).toEqual({
          created_via: key,
          oauth_client: null,
        })
      }
    })
  })

  describe('the list route', () => {
    const listed = async (viewer: Viewer) =>
      (await (await as(viewer)).get(entity.listPath).expect(200)).body

    it('labels each row with the same rules as the detail route', async () => {
      const body = await listed(entity.listViewer?.())
      expect(entity.fromList(body, ids.mcp)?.provenance).toEqual(verifiedLabel())
      expect(entity.fromList(body, ids.api)?.provenance).toEqual({ via: 'api', app: null })
      for (const key of ['web', 'swift', 'dotnet', 'system'] as const) {
        const row = entity.fromList(body, ids[key])
        expect(row).toBeDefined()
        expect(row).not.toHaveProperty('provenance')
        expect(row).not.toHaveProperty('staff_provenance')
      }
    })

    it('shows the staff block on every row to an administrator only', async () => {
      const forAdmin = entity.listViewer ? undefined : await listed(admin)
      const forAuthor = await listed(entity.listViewer?.() ?? reader)
      expect(entity.fromList(forAuthor, ids.mcp)).not.toHaveProperty('staff_provenance')
      if (!forAdmin) return
      for (const key of KEYS) {
        expect(entity.fromList(forAdmin, ids[key])?.staff_provenance?.created_via).toBe(key)
      }
    })
  })
})
