import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestMembership, createTestPost, createTestUser } from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import {
  getTestOAuthClientPublicId,
  renameTestOAuthClient,
} from '@voucha/test-helpers/entities/oauth-client-management'
import type { CredentialRequestOrigin } from '@modules/request-client-info'

const SCOPES = ['posts:read', 'posts:write'] as const
const APP_NAME = `Write Agent ${randomBytes(6).toString('hex')}`

type WrittenPost = { id: string; provenance?: unknown }

async function caller(administrator = false) {
  const user = await createTestUser({ administrator })
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

let author: Awaited<ReturnType<typeof caller>>
let admin: Awaited<ReturnType<typeof caller>>
let clientRowId: string
let clientPublicId: string

const oauthOrigin = (oauthClientId = clientRowId): CredentialRequestOrigin => ({
  interface: 'mcp',
  credential: 'oauth',
  client: null,
  oauthClientId,
})
const mcpFact = () => ({ createdVia: 'mcp', oauthClientId: clientRowId }) as const
const verifiedApp = () => ({
  kind: 'verified',
  client_id: clientPublicId,
  client_name: APP_NAME,
})

const createArgs = (body: Record<string, unknown> = {}) => ({
  idempotency_key: crypto.randomUUID(),
  title: `MCP ${crypto.randomUUID()}`,
  markdown: 'My experience with this topic was useful.',
  ...body,
})
const createPost = async (
  user: typeof author,
  body: Record<string, unknown> = {},
  origin?: CredentialRequestOrigin,
) =>
  (await callStructuredMcpTool(user, 'create_post', createArgs(body), SCOPES, origin))
    .post as WrittenPost
const updatePost = async (user: typeof author, id: string) =>
  (
    await callStructuredMcpTool(
      user,
      'update_post',
      { id, title: `Edited ${randomBytes(4).toString('hex')}` },
      SCOPES,
      oauthOrigin(),
    )
  ).post as WrittenPost

describe('MCP post provenance on write tools', () => {
  beforeAll(async () => {
    ;[author, admin] = await Promise.all([caller(), caller(true)])
    clientRowId = await insertContentProvenanceOAuthClient({
      verifiedAt: new Date(),
      verifiedById: admin.id,
    })
    await renameTestOAuthClient(clientRowId, APP_NAME)
    clientPublicId = await getTestOAuthClientPublicId(clientRowId)
  })

  describe('create_post', () => {
    it('labels a post written through an OAuth client with that client', async () => {
      const post = await createPost(author, {}, oauthOrigin())
      expect(post.provenance).toEqual({ via: 'mcp', app: verifiedApp() })
    })

    it('labels a post written with an API key without an app', async () => {
      expect((await createPost(author)).provenance).toEqual({ via: 'mcp', app: null })
    })

    it('never names the client behind an anonymous post, even to its author or an administrator', async () => {
      for (const user of [author, admin]) {
        const post = await createPost(user, { is_anonymous: true }, oauthOrigin())
        expect(post.provenance).toEqual({ via: 'mcp', app: null })
        for (const secret of [APP_NAME, clientRowId, clientPublicId])
          expect(JSON.stringify(post)).not.toContain(secret)
      }
    })

    it('never returns the staff detail, even to an administrator', async () => {
      const post = await createPost(admin, {}, oauthOrigin())
      expect(post).not.toHaveProperty('staff_provenance')
      expect(post.provenance).toEqual({ via: 'mcp', app: verifiedApp() })
      expect(JSON.stringify(post)).not.toContain('metadata_url')
    })

    it('labels a retry from the client as it is now, because the stored result carries no label', async () => {
      const rowId = await insertContentProvenanceOAuthClient({
        verifiedAt: new Date(),
        verifiedById: admin.id,
      })
      await renameTestOAuthClient(rowId, 'Before rename')
      const publicId = await getTestOAuthClientPublicId(rowId)
      const args = createArgs()
      const send = async () =>
        (await callStructuredMcpTool(author, 'create_post', args, SCOPES, oauthOrigin(rowId)))
          .post as WrittenPost
      const first = await send()
      expect(first.provenance).toEqual({
        via: 'mcp',
        app: { kind: 'verified', client_id: publicId, client_name: 'Before rename' },
      })
      await renameTestOAuthClient(rowId, 'After rename')
      const replay = await send()
      expect(replay.id).toBe(first.id)
      expect(replay.provenance).toEqual({
        via: 'mcp',
        app: { kind: 'verified', client_id: publicId, client_name: 'After rename' },
      })
    })
  })

  describe('update_post', () => {
    it('labels an edited post written through an OAuth client', async () => {
      const seeded = await createTestPost({ user: author, provenance: mcpFact() })
      expect((await updatePost(author, seeded.id)).provenance).toEqual({
        via: 'mcp',
        app: verifiedApp(),
      })
    })

    it('labels an edited API post without an app', async () => {
      const seeded = await createTestPost({
        user: author,
        provenance: { createdVia: 'api', oauthClientId: null },
      })
      expect((await updatePost(author, seeded.id)).provenance).toEqual({ via: 'api', app: null })
    })

    it('leaves the label off an edited post written on the web', async () => {
      const seeded = await createTestPost({
        user: author,
        provenance: { createdVia: 'web', oauthClientId: null },
      })
      expect(await updatePost(author, seeded.id)).not.toHaveProperty('provenance')
    })

    it('never names the client behind an edited anonymous post', async () => {
      const seeded = await createTestPost({
        user: author,
        is_anonymous: true,
        provenance: mcpFact(),
      })
      const post = await updatePost(author, seeded.id)
      expect(post.provenance).toEqual({ via: 'mcp', app: null })
      expect(JSON.stringify(post)).not.toContain(APP_NAME)
    })

    it('never returns the staff detail, even to an administrator editing their own post', async () => {
      const seeded = await createTestPost({ user: admin, provenance: mcpFact() })
      const post = await updatePost(admin, seeded.id)
      expect(post).not.toHaveProperty('staff_provenance')
      expect(post.provenance).toEqual({ via: 'mcp', app: verifiedApp() })
    })
  })
})
