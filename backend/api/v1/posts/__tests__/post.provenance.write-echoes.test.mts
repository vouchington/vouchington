import { randomBytes } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestPost,
} from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  getTestOAuthClientPublicId,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'

import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'

const suffix = randomBytes(6).toString('hex')
const APP_NAME = `Echo Agent ${suffix}`

let author: PrivateUser
let admin: PrivateUser
let staffCreator: PrivateUser
let moderator: PrivateUser
let clientRowId: string
let clientPublicId: string

const verifiedLabel = () => ({
  via: 'mcp',
  app: { kind: 'verified', client_id: clientPublicId, client_name: APP_NAME },
})

const seed = (owner: PrivateUser, provenance: ContentProvenance, isAnonymous = false) =>
  insertTestPost({
    title: `Echo ${randomBytes(4).toString('hex')}`,
    slug: `echo-${randomBytes(6).toString('hex')}`,
    createdById: owner.id,
    markdown: 'Write echo route test',
    provenance,
    isAnonymous,
  })

const mcpFact = () => ({ createdVia: 'mcp', oauthClientId: clientRowId }) as const

const patch = async (id: string, viewer: PrivateUser) => {
  const request = createRequest()
  await request.authenticateAs(viewer)
  const { body } = await request
    .patch(`/api/v1/posts/${id}`)
    .send({ title: `Edited ${randomBytes(4).toString('hex')}` })
    .expect(200)
  return body.post
}

const create = async (viewer: PrivateUser, clientHeaders: Record<string, string> = {}) => {
  const request = createRequest()
  request.setClientInfo(clientHeaders)
  await request.authenticateAs(viewer)
  const { body } = await request
    .post('/api/v1/posts')
    .send({ post_type: 'discussion', title: `Created ${suffix}`, markdown: 'Created echo content' })
    .expect(201)
  return body.post
}

describe('post provenance on write echoes', () => {
  beforeAll(async () => {
    ;[author, admin, staffCreator, moderator] = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      createTestUser({ administrator: true }),
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    clientRowId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(clientRowId, APP_NAME)
    clientPublicId = await getTestOAuthClientPublicId(clientRowId)
  })

  describe('POST /api/v1/posts', () => {
    it('has no label on a post created by the web client, for its author', async () => {
      const post = await create(author)
      expect(post).not.toHaveProperty('provenance')
      expect(post).not.toHaveProperty('staff_provenance')
    })

    it('gives moderation staff the channel of the post they just created', async () => {
      const adminPost = await create(staffCreator)
      const swiftPost = await create(staffCreator, {
        'x-voucha-client': 'swift',
        'x-voucha-platform': 'ios',
      })
      expect(adminPost.staff_provenance).toEqual({ created_via: 'web', oauth_client: null })
      expect(swiftPost.staff_provenance).toEqual({ created_via: 'swift', oauth_client: null })
      expect(adminPost).not.toHaveProperty('provenance')
    })
  })

  describe('PATCH /api/v1/posts/:idOrSlug', () => {
    it('labels an edited MCP post for its author without the staff detail', async () => {
      const post = await patch(await seed(author, mcpFact()), author)
      expect(post.provenance).toEqual(verifiedLabel())
      expect(post).not.toHaveProperty('staff_provenance')
      expect(JSON.stringify(post)).not.toContain('metadata_url')
    })

    it('labels an edited API post with no app', async () => {
      const post = await patch(
        await seed(author, { createdVia: 'api', oauthClientId: null }),
        author,
      )
      expect(post.provenance).toEqual({ via: 'api', app: null })
    })

    it.each(['web', 'swift', 'dotnet', 'system'] as const)(
      'leaves the label off an edited %s post',
      async channel => {
        const post = await patch(
          await seed(author, { createdVia: channel, oauthClientId: null }),
          author,
        )
        expect(post).not.toHaveProperty('provenance')
        expect(post).not.toHaveProperty('staff_provenance')
      },
    )

    it('gives an administrator the label and the raw OAuth client', async () => {
      const post = await patch(await seed(author, mcpFact()), admin)
      expect(post.provenance).toEqual(verifiedLabel())
      expect(post.staff_provenance).toEqual({
        created_via: 'mcp',
        oauth_client: {
          client_id: clientPublicId,
          client_name: APP_NAME,
          metadata_url: null,
          verified: true,
        },
      })
    })

    it('gives a moderator who edits their own post the staff detail', async () => {
      const post = await patch(await seed(moderator, mcpFact()), moderator)
      expect(post.provenance).toEqual(verifiedLabel())
      expect(post.staff_provenance.created_via).toBe('mcp')
    })

    it('shows the app behind an anonymous post to its author and to an administrator', async () => {
      const id = await seed(author, mcpFact(), true)
      for (const viewer of [author, admin]) {
        const post = await patch(id, viewer)
        expect(post.provenance).toEqual(verifiedLabel())
      }
    })

    it('shows a rename in the response of the next edit', async () => {
      const ownRowId = await insertContentProvenanceOAuthClient({
        verifiedAt: new Date(),
        verifiedById: admin.id,
      })
      await renameTestOAuthClient(ownRowId, 'Before rename')
      const publicId = await getTestOAuthClientPublicId(ownRowId)
      const labelFor = (name: string) => ({
        via: 'mcp',
        app: { kind: 'verified', client_id: publicId, client_name: name },
      })
      const id = await seed(author, { createdVia: 'mcp', oauthClientId: ownRowId })
      expect((await patch(id, author)).provenance).toEqual(labelFor('Before rename'))
      await renameTestOAuthClient(ownRowId, 'After rename')
      expect((await patch(id, author)).provenance).toEqual(labelFor('After rename'))
    })
  })
})
