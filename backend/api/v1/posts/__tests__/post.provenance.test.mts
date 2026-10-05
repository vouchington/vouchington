import { randomBytes } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { renameTestOAuthClient } from '@voucha/test-helpers/entities/oauth-client-management'

import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'

const suffix = randomBytes(6).toString('hex')
const APP_NAME = `Route Agent ${suffix}`

let author: PrivateUser
let admin: PrivateUser
let moderator: PrivateUser
let reader: PrivateUser
let clientRowId: string
const ids: Record<string, string> = {}

const seed = async (key: string, provenance: ContentProvenance, isAnonymous = false) => {
  ids[key] = await insertTestPost({
    title: `Provenance ${key} ${suffix}`,
    slug: `provenance-${key}-${suffix}`,
    createdById: author.id,
    markdown: 'Provenance route test',
    provenance,
    isAnonymous,
  })
}

const detail = async (key: string, viewer?: PrivateUser) => {
  const request = createRequest()
  if (viewer) await request.authenticateAs(viewer)
  return (await request.get(`/api/v1/posts/${ids[key]}`).expect(200)).body.post
}

describe('post provenance', () => {
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
    await seed('mcp', { createdVia: 'mcp', oauthClientId: clientRowId })
    await seed('api', { createdVia: 'api', oauthClientId: null })
    await seed('anon', { createdVia: 'mcp', oauthClientId: clientRowId }, true)
    for (const channel of ['web', 'swift', 'dotnet', 'system'] as const) {
      await seed(channel, { createdVia: channel, oauthClientId: null })
    }
  })

  describe('post provenance on read routes', () => {
    describe('GET /api/v1/posts/:idOrSlug', () => {
      it('labels api and mcp posts for signed-out readers', async () => {
        expect((await detail('mcp')).provenance).toEqual({ via: 'mcp', app_name: APP_NAME })
        expect((await detail('api')).provenance).toEqual({ via: 'api', app_name: null })
      })

      it.each(['web', 'swift', 'dotnet', 'system'])('has no label on %s posts', async channel => {
        const post = await detail(channel)
        expect(post).not.toHaveProperty('provenance')
        expect(post).not.toHaveProperty('staff_provenance')
      })

      it('never exposes the raw client or channel to signed-out, regular or author viewers', async () => {
        for (const viewer of [undefined, reader, author]) {
          const post = await detail('mcp', viewer)
          expect(post).not.toHaveProperty('staff_provenance')
          expect(JSON.stringify(post)).not.toContain(clientRowId)
        }
      })

      it.each([
        ['administrator', () => admin],
        ['moderator', () => moderator],
      ])('shows %s every channel and the raw OAuth client', async (_role, viewer) => {
        expect((await detail('mcp', viewer())).staff_provenance).toEqual({
          created_via: 'mcp',
          oauth_client: {
            client_id: expect.stringMatching(/^voucha_/),
            client_name: APP_NAME,
            metadata_url: null,
            verified: true,
          },
        })
        expect((await detail('web', viewer())).staff_provenance).toEqual({
          created_via: 'web',
          oauth_client: null,
        })
        expect((await detail('swift', viewer())).staff_provenance?.created_via).toBe('swift')
      })

      it('hides the app behind an anonymous author from readers and moderators', async () => {
        for (const viewer of [undefined, reader, moderator]) {
          const post = await detail('anon', viewer)
          expect(post.provenance).toEqual({ via: 'mcp', app_name: null })
          expect(post.created_by_id).toBeNull()
          expect(JSON.stringify(post)).not.toContain(APP_NAME)
        }
        expect((await detail('anon', moderator)).staff_provenance).toEqual({ created_via: 'mcp' })
      })

      it('shows the app behind an anonymous post to its author and to an administrator', async () => {
        expect((await detail('anon', author)).provenance?.app_name).toBe(APP_NAME)
        const forAdmin = await detail('anon', admin)
        expect(forAdmin.provenance?.app_name).toBe(APP_NAME)
        expect(forAdmin.staff_provenance?.oauth_client?.client_name).toBe(APP_NAME)
      })
    })

    describe('GET /api/v1/posts', () => {
      it('labels list rows with the same rules as the detail route', async () => {
        const request = createRequest()
        const { body } = await request.get(`/api/v1/posts?creator=${author.id}`).expect(200)
        expect(body.posts[ids.mcp!].provenance).toEqual({ via: 'mcp', app_name: APP_NAME })
        expect(body.posts[ids.api!].provenance).toEqual({ via: 'api', app_name: null })
        expect(body.posts[ids.web!]).not.toHaveProperty('provenance')
        expect(body.posts[ids.mcp!]).not.toHaveProperty('staff_provenance')
      })

      it('gives staff every channel on list rows', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const { body } = await request.get(`/api/v1/posts?creator=${author.id}`).expect(200)
        expect(body.posts[ids.web!].staff_provenance).toEqual({
          created_via: 'web',
          oauth_client: null,
        })
        expect(body.posts[ids.mcp!].staff_provenance.oauth_client.client_name).toBe(APP_NAME)
      })
    })

    describe('GET /api/v1/posts/:idOrSlug/descendants', () => {
      it('labels comments created through the API or MCP', async () => {
        const commentId = await insertTestPost({
          title: '',
          slug: `provenance-comment-${suffix}`,
          createdById: author.id,
          markdown: 'A comment written by an agent',
          postType: 'comment',
          rootId: ids.web!,
          parentId: ids.web!,
          provenance: { createdVia: 'mcp', oauthClientId: clientRowId },
        })
        const { body } = await createRequest()
          .get(`/api/v1/posts/${ids.web}/descendants`)
          .expect(200)
        expect(body.posts[commentId].provenance).toEqual({ via: 'mcp', app_name: APP_NAME })
      })
    })
  })
})
