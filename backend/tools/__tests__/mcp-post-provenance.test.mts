import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { renameTestOAuthClient } from '@voucha/test-helpers/entities/oauth-client-management'
import type { PrivateUser } from '@services/users/types'

const SCOPES = ['posts:read'] as const
const APP_NAME = `MCP Agent ${randomBytes(6).toString('hex')}`

let admin: PrivateUser
let author: PrivateUser
let clientId: string
let root: { id: string }
const posts: Record<string, { id: string }> = {}

const verifiedApp = () => ({
  kind: 'verified',
  client_id: clientId,
  client_name: APP_NAME,
})

const read = async (tool: string, id: string, caller: PrivateUser = author) =>
  callStructuredMcpTool({ ...caller, membership_plan: null }, tool, { post_id: id }, SCOPES)

describe('MCP post provenance read tools', () => {
  beforeAll(async () => {
    ;[admin, author] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    clientId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(clientId, APP_NAME)
    const mcp = { createdVia: 'mcp', oauthClientId: clientId } as const
    root = await createTestPost({ user: author, provenance: mcp })
    const comment = (key: string, extra: Record<string, unknown>) =>
      createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
        root_post_id: root.id,
        ...extra,
      }).then(post => (posts[key] = post))
    await comment('web', { provenance: { createdVia: 'web', oauthClientId: null } })
    await comment('api', { provenance: { createdVia: 'api', oauthClientId: null } })
    await comment('anonymous', { is_anonymous: true, provenance: mcp })
  })

  describe('MCP post provenance', () => {
    it('get_post carries the public label for API and MCP posts', async () => {
      expect((await read('get_post', root.id)).post).toMatchObject({
        provenance: { via: 'mcp', app: verifiedApp() },
      })
      expect((await read('get_post', posts.api!.id)).post).toMatchObject({
        provenance: { via: 'api', app: null },
      })
    })

    it('leaves the label off posts written on the web', async () => {
      expect(await read('get_post', posts.web!.id)).toEqual({
        success: true,
        post: expect.not.objectContaining({ provenance: expect.anything() }),
      })
    })

    it('never names the client behind an anonymous post, even to an administrator or its author', async () => {
      for (const caller of [author, admin]) {
        const { post } = await read('get_post', posts.anonymous!.id, caller)
        expect(post).toMatchObject({ provenance: { via: 'mcp', app: null } })
        expect(JSON.stringify(post)).not.toContain(APP_NAME)
        expect(JSON.stringify(post)).not.toContain(clientId)
      }
    })

    it('never returns the staff detail, even to an administrator', async () => {
      const { post } = await read('get_post', root.id, admin)
      expect(post).not.toHaveProperty('staff_provenance')
      expect(post).toMatchObject({ provenance: { via: 'mcp', app: verifiedApp() } })
      expect(JSON.stringify(post)).not.toContain('metadata_url')
    })

    it('labels the posts that get_post_ancestors and get_post_descendants return', async () => {
      const { ancestors } = await read('get_post_ancestors', posts.api!.id)
      expect(ancestors).toEqual([
        expect.objectContaining({ id: root.id, provenance: { via: 'mcp', app: verifiedApp() } }),
      ])
      const { descendants } = await read('get_post_descendants', root.id)
      const byId = new Map((descendants as { id: string }[]).map(post => [post.id, post]))
      expect(byId.get(posts.api!.id)).toMatchObject({ provenance: { via: 'api', app: null } })
      expect(byId.get(posts.web!.id)).not.toHaveProperty('provenance')
    })
  })
})
