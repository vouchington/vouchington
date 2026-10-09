import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  getTestOAuthClientPublicId,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'
import type { PrivateUser } from '@services/users/types'

const SCOPES = ['posts:read'] as const
const APP_NAME = `MCP Agent ${randomBytes(6).toString('hex')}`

let admin: PrivateUser
let author: PrivateUser
let clientId: string
let clientPublicId: string
let root: { id: string }
const posts: Record<string, { id: string }> = {}

const verifiedApp = () => ({
  kind: 'verified',
  client_id: clientPublicId,
  client_name: APP_NAME,
})

const read = async (
  option: 'details' | 'ancestors' | 'descendants',
  id: string,
  caller: PrivateUser = author,
) =>
  callStructuredMcpTool(
    { ...caller, membership_plan: null },
    'read_posts',
    optionArgs(option, { post_id: id }),
    SCOPES,
  )

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
    clientPublicId = await getTestOAuthClientPublicId(clientId)
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
    it('read_posts.details carries the public label for API and MCP posts', async () => {
      expect((await read('details', root.id)).post).toMatchObject({
        provenance: { via: 'mcp', app: verifiedApp() },
      })
      expect((await read('details', posts.api!.id)).post).toMatchObject({
        provenance: { via: 'api', app: null },
      })
    })

    it('leaves the label off posts written on the web', async () => {
      expect(await read('details', posts.web!.id)).toEqual({
        success: true,
        post: expect.not.objectContaining({ provenance: expect.anything() }),
      })
    })

    it('never names the client behind an anonymous post, even to an administrator or its author', async () => {
      for (const caller of [author, admin]) {
        const { post } = await read('details', posts.anonymous!.id, caller)
        expect(post).toMatchObject({ provenance: { via: 'mcp', app: null } })
        expect(JSON.stringify(post)).not.toContain(APP_NAME)
        expect(JSON.stringify(post)).not.toContain(clientId)
        expect(JSON.stringify(post)).not.toContain(clientPublicId)
      }
    })

    it('never returns the staff detail, even to an administrator', async () => {
      const { post } = await read('details', root.id, admin)
      expect(post).not.toHaveProperty('staff_provenance')
      expect(post).toMatchObject({ provenance: { via: 'mcp', app: verifiedApp() } })
      expect(JSON.stringify(post)).not.toContain('metadata_url')
    })

    it('labels the posts that read_posts.ancestors and read_posts.descendants return', async () => {
      const { ancestors } = await read('ancestors', posts.api!.id)
      expect(ancestors).toEqual([
        expect.objectContaining({ id: root.id, provenance: { via: 'mcp', app: verifiedApp() } }),
      ])
      const { descendants } = await read('descendants', root.id)
      const byId = new Map((descendants as { id: string }[]).map(post => [post.id, post]))
      expect(byId.get(posts.api!.id)).toMatchObject({ provenance: { via: 'api', app: null } })
      expect(byId.get(posts.web!.id)).not.toHaveProperty('provenance')
    })
  })
})
