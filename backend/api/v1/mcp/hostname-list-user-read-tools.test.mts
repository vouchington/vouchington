import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import type { ApiScope } from '@modules/scopes'
import { createApiKey } from '@services/api-keys'
import { addListItem } from '@services/lists'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  insertTestList,
  insertTestPost,
  insertTestUrlHostname,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { describe, expect, it } from 'vitest'

type Kind = 'api_key' | 'oauth'
type Body = Record<string, unknown>
type ToolResult = { isError?: boolean; structuredContent?: Body }

const KINDS = ['api_key', 'oauth'] as const satisfies readonly Kind[]
const READ = ['hostnames:read', 'users:read', 'lists:read'] as const satisfies readonly ApiScope[]
// The private-data consent scope can only be granted together with the relation scopes it extends.
const OWNED_PRIVATE = [
  ...READ,
  'entity-relations:read',
  'entity-relations:write',
  'post-relations.owned-private:write',
] as const
const LIST_NOT_FOUND = { success: false, error: 'List not found' }
const TOOLS = ['read_hostnames', 'read_users', 'read_my_lists']

function postMcp(token: string, body: unknown) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object)
}

const toolCall = (name: string, args: Body) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
})

async function issueCredential(
  kind: Kind,
  user: PrivateUser,
  scopes: readonly ApiScope[],
): Promise<string> {
  if (kind === 'oauth') {
    return (await issueTestOAuthTokens(user, { scope: scopes.join(' ') })).access_token
  }
  const { rawKey } = await createApiKey(user.id, 'mcp', `Read ${createRandomString(6)}`, [
    ...scopes,
  ])
  return rawKey
}

async function callTool(token: string, name: string, args: Body = {}): Promise<ToolResult> {
  const response = await postMcp(token, toolCall(name, args)).expect(200)

  return (response.body as { result: ToolResult }).result
}

// The structured payload of a tool call that did not fail at the protocol level.
async function readTool(token: string, name: string, args: Body = {}): Promise<Body> {
  const result = await callTool(token, name, args)

  expect(result.isError).toBeUndefined()
  return result.structuredContent!
}

const resultIds = (page: Body) => (page['results'] as Array<{ id: string }>).map(row => row.id)

describe('hostname, list and user read tools over MCP HTTP', () => {
  it.each(KINDS)('%s reads users, hostnames and lists end to end', async kind => {
    const owner = await createTestUser()
    const post = await insertTestPost({
      title: `Listed ${createRandomString(6)}`,
      slug: `listed-${createRandomString(6).toLowerCase()}`,
      createdById: owner.id,
      markdown: 'A post on a list',
    })
    const list = await insertTestList({
      ownerUserId: owner.id,
      name: `Public ${createRandomString(6)}`,
      visibility: 'public',
    })
    await addListItem(list.id, 'post', post)
    const hostname = `e2e-${createRandomString(8).toLowerCase()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const token = await issueCredential(kind, owner, READ)

    const user = await readTool(
      token,
      'read_users',
      optionArgs('details', { user_id: owner.username! }),
    )
    const users = await readTool(token, 'read_users', optionArgs('search', { q: owner.username! }))
    const hostnames = await readTool(token, 'read_hostnames', optionArgs('search', { hostname }))
    const mine = await readTool(token, 'read_my_lists', optionArgs('list', {}))
    const one = await readTool(token, 'read_my_lists', optionArgs('get', { list_id: list.id }))
    const items = await readTool(token, 'read_my_lists', optionArgs('items', { list_id: list.id }))

    expect(user).toMatchObject({ success: true, user: { id: owner.id } })
    expect(resultIds(users)).toEqual([owner.id])
    expect(resultIds(hostnames)).toEqual([hostnameId])
    expect(resultIds(mine)).toEqual([list.id])
    expect(one).toMatchObject({ success: true, list: { id: list.id, visibility: 'public' } })
    expect(items).toMatchObject({
      success: true,
      results: [{ list_id: list.id, item_type: 'post', entity_id: post }],
      page_info: { has_next_page: false },
    })
  })

  it.each(KINDS)(
    '%s gives a stranger the same public list and a private one to nobody',
    async kind => {
      const owner = await createTestUser()
      const stranger = await createTestUser()
      const label = createRandomString(6)
      const pub = await insertTestList({
        ownerUserId: owner.id,
        name: `Open ${label}`,
        visibility: 'public',
      })
      const priv = await insertTestList({
        ownerUserId: owner.id,
        name: `Closed ${label}`,
        visibility: 'private',
      })
      const strangerToken = await issueCredential(kind, stranger, OWNED_PRIVATE)

      expect(
        await readTool(strangerToken, 'read_my_lists', optionArgs('get', { list_id: pub.id })),
      ).toMatchObject({
        success: true,
        list: { id: pub.id },
      })
      expect(
        await readTool(strangerToken, 'read_my_lists', optionArgs('get', { list_id: priv.id })),
      ).toEqual(LIST_NOT_FOUND)
      expect(
        await readTool(strangerToken, 'read_my_lists', optionArgs('items', { list_id: priv.id })),
      ).toEqual(LIST_NOT_FOUND)
      expect(
        resultIds(await readTool(strangerToken, 'read_my_lists', optionArgs('list', {}))),
      ).toEqual([])
    },
  )

  it.each(KINDS)(
    '%s shows a private list to its owner only with the exact private grant',
    async kind => {
      const owner = await createTestUser()
      const label = createRandomString(6)
      const priv = await insertTestList({
        ownerUserId: owner.id,
        name: `Secret ${label}`,
        visibility: 'private',
      })
      const ordinary = await issueCredential(kind, owner, READ)
      const exact = await issueCredential(kind, owner, OWNED_PRIVATE)

      expect(
        await readTool(ordinary, 'read_my_lists', optionArgs('get', { list_id: priv.id })),
      ).toEqual(LIST_NOT_FOUND)
      expect(
        await readTool(ordinary, 'read_my_lists', optionArgs('items', { list_id: priv.id })),
      ).toEqual(LIST_NOT_FOUND)
      expect(resultIds(await readTool(ordinary, 'read_my_lists', optionArgs('list', {})))).toEqual(
        [],
      )

      expect(
        await readTool(exact, 'read_my_lists', optionArgs('get', { list_id: priv.id })),
      ).toMatchObject({
        success: true,
        list: { id: priv.id, visibility: 'private' },
      })
      expect(
        await readTool(exact, 'read_my_lists', optionArgs('items', { list_id: priv.id })),
      ).toMatchObject({
        success: true,
        results: [],
      })
      expect(resultIds(await readTool(exact, 'read_my_lists', optionArgs('list', {})))).toEqual([
        priv.id,
      ])
    },
  )

  it.each(KINDS)(
    '%s lists the three merged tools with their schemas and nothing without the scopes',
    async kind => {
      const user = await createTestUser()
      const listTools = async (token: string) => {
        const response = await postMcp(token, {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }).expect(200)
        return (response.body as { result: { tools: Array<Body & { name: string }> } }).result.tools
      }

      const listed = (await listTools(await issueCredential(kind, user, READ))).filter(tool =>
        TOOLS.includes(tool.name),
      )
      const unrelated = await listTools(await issueCredential(kind, user, ['topics:read']))

      expect(listed.map(tool => tool.name).toSorted()).toEqual(TOOLS.toSorted())
      for (const tool of listed) {
        expect(tool).toMatchObject({
          annotations: { readOnlyHint: true },
          outputSchema: { type: 'object' },
        })
      }
      expect(unrelated.filter(tool => TOOLS.includes(tool.name))).toEqual([])
    },
  )

  it('oauth asks the client to step up when a call lacks the scope', async () => {
    const user = await createTestUser()
    const token = await issueCredential('oauth', user, ['lists:read'])

    const response = await postMcp(
      token,
      toolCall('read_users', optionArgs('search', { q: 'anyone' })),
    ).expect(403)

    expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"')
    expect(response.headers['www-authenticate']).toContain('users:read')
  })

  it('api_key keeps a call that lacks the scope in-band and returns no data', async () => {
    const user = await createTestUser()
    const token = await issueCredential('api_key', user, ['lists:read'])

    const response = await postMcp(
      token,
      toolCall('read_users', optionArgs('search', { q: user.username! })),
    ).expect(200)

    expect(response.body).toMatchObject({ error: { code: -32600 } })
    expect(response.body).not.toHaveProperty('result')
  })

  it.each(KINDS)('%s is rejected once its owner is suspended', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, READ)
    await readTool(token, 'read_users', optionArgs('details', { user_id: user.id }))
    await suspendTestUser(user.id)

    await postMcp(
      token,
      toolCall('read_users', optionArgs('details', { user_id: user.id })),
    ).expect(401)
  })
})
