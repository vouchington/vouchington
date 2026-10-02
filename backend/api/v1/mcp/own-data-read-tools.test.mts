import type { ApiScope } from '@modules/scopes'
import { createApiKey } from '@services/api-keys'
import { createProfileLink } from '@services/my/profile-links'
import { createFollowNotification } from '@services/notifications'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  setUserMarkdown,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { describe, expect, it } from 'vitest'

type Kind = 'api_key' | 'oauth'
type Body = Record<string, unknown>
type ToolCallBody = {
  result?: { isError?: boolean; structuredContent?: Body }
  error?: { code: number; message: string }
}

const KINDS = ['api_key', 'oauth'] as const satisfies readonly Kind[]
const ALL = ['profile:read', 'notifications:read', 'preferences:read'] as const
const TOOLS = [
  'get_my_notifications',
  'get_my_unread_notifications',
  'get_my_bio',
  'get_my_profile_links',
  'get_my_email_preferences',
  'get_my_preferences',
]

function postMcp(token: string, body: unknown) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object)
}

const callTool = (token: string, name: string, args: Body = {}) =>
  postMcp(token, {
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
  const { rawKey } = await createApiKey(user.id, 'mcp', `Own data ${createRandomString(6)}`, [
    ...scopes,
  ])
  return rawKey
}

// The structured payload of a tool call that did not fail at the protocol level.
async function readTool(token: string, name: string, args: Body = {}): Promise<Body> {
  const response = await callTool(token, name, args).expect(200)
  const result = (response.body as ToolCallBody).result

  expect(result?.isError).toBeUndefined()
  return result!.structuredContent!
}

async function listToolNames(token: string): Promise<string[]> {
  const response = await postMcp(token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  }).expect(200)
  const tools = (response.body as { result: { tools: Array<{ name: string }> } }).result.tools
  return tools.map(tool => tool.name).filter(name => TOOLS.includes(name))
}

describe('own profile, notification and preference read tools over MCP HTTP', () => {
  it.each(KINDS)('%s reads the owner’s own data end to end', async kind => {
    const owner = await createTestUser()
    const actor = await createTestUser()
    const [notification] = await createFollowNotification(owner.id, actor.id, actor.username)
    await setUserMarkdown(owner.id, 'My *bio*')
    const link = await createProfileLink(owner.id, {
      link_type: 'url',
      url: 'https://example.com/me',
    })
    const token = await issueCredential(kind, owner, ALL)

    const page = await readTool(token, 'get_my_notifications')
    const unread = await readTool(token, 'get_my_unread_notifications')
    const bio = await readTool(token, 'get_my_bio')
    const links = await readTool(token, 'get_my_profile_links')
    const emailPreferences = await readTool(token, 'get_my_email_preferences')
    const preferences = await readTool(token, 'get_my_preferences')

    expect(page).toMatchObject({
      success: true,
      results: [{ id: notification!.id, read_at: null }],
      page_info: { has_next_page: false },
    })
    expect(unread).toMatchObject({ success: true, unread_count: 1 })
    expect(bio).toEqual({ success: true, profile: { id: owner.id, markdown: 'My *bio*' } })
    expect(links).toMatchObject({ success: true, results: [{ id: link.id }] })
    expect(emailPreferences).toMatchObject({ success: true, email_preferences: expect.any(Object) })
    expect(preferences).toMatchObject({ success: true, settings: expect.any(Object) })
  })

  it.each(KINDS)('%s lists a tool only with the scope it needs', async kind => {
    const user = await createTestUser()

    expect((await listToolNames(await issueCredential(kind, user, ALL))).toSorted()).toEqual(
      TOOLS.toSorted(),
    )
    expect(await listToolNames(await issueCredential(kind, user, ['notifications:read']))).toEqual([
      'get_my_notifications',
      'get_my_unread_notifications',
    ])
    expect(await listToolNames(await issueCredential(kind, user, ['hostnames:read']))).toEqual([])
  })

  it.each(KINDS)('%s refuses a tool whose scope the credential lacks', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, ['notifications:read'])

    const response = await callTool(token, 'get_my_bio').expect(kind === 'oauth' ? 403 : 200)

    expect((response.body as ToolCallBody).result?.structuredContent).toBeUndefined()
  })

  it.each(KINDS)('%s is rejected once its owner is suspended', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, ALL)
    await readTool(token, 'get_my_bio')
    await suspendTestUser(user.id)

    await callTool(token, 'get_my_bio').expect(401)
  })
})
