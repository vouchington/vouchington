import type { ApiScope } from '@modules/scopes'
import { createApiKey } from '@services/api-keys'
import { createUserReferralLink } from '@services/user-referral-program-links'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  insertTestUrl,
  insertTestUrlHostname,
  suspendTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { describe, expect, it } from 'vitest'

type Kind = 'api_key' | 'oauth'
type Body = Record<string, unknown>
type ToolResult = { isError?: boolean; structuredContent?: Body }

const KINDS = ['api_key', 'oauth'] as const satisfies readonly Kind[]
const READ = [
  'communities:read',
  'topics:read',
  'referral-links:read',
  'web-search:read',
  'reference-data:read',
] as const satisfies readonly ApiScope[]
const TOOLS = [
  'get_trending_communities',
  'get_trending_referral_programs',
  'get_topic_referral_program',
  'get_my_referral_links',
  'search_web',
  'list_countries',
  'list_currencies',
  'get_platform_stats',
]

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

describe('trending, referral, search and reference-data read tools over MCP HTTP', () => {
  it.each(KINDS)('%s reads referral programs and links end to end', async kind => {
    const owner = await createTestUser()
    const program = await createReferralProgramFixture({ createdById: owner.id })
    const link = await createUserReferralLink(owner, WEB_PROVENANCE, {
      user_id: owner.id,
      referral_program_id: program.referralProgramId,
      url: `https://${program.hostname}/ref/${createRandomString(8)}`,
    })
    const token = await issueCredential(kind, owner, READ)

    const state = await readTool(token, 'get_topic_referral_program', {
      topic_id: program.referralProgramId,
    })
    const mine = await readTool(token, 'get_my_referral_links', {
      referral_program_id: program.referralProgramId,
    })

    expect(state).toMatchObject({
      success: true,
      topic_id: program.referralProgramId,
      disabled_at: null,
    })
    expect(resultIds(mine)).toEqual([link.id])
    expect(mine).toMatchObject({ page_info: { has_next_page: false } })
  })

  it.each(KINDS)('%s reads the trending lists and the reference data', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, READ)

    const communities = await readTool(token, 'get_trending_communities', { limit: 1 })
    const programs = await readTool(token, 'get_trending_referral_programs', { limit: 1 })
    const countries = await readTool(token, 'list_countries')
    const currencies = await readTool(token, 'list_currencies', { limit: 2 })
    const stats = await readTool(token, 'get_platform_stats')

    expect(communities).toMatchObject({ success: true, page_info: expect.any(Object) })
    expect(programs).toMatchObject({ success: true, page_info: expect.any(Object) })
    expect(countries).toMatchObject({
      success: true,
      results: expect.arrayContaining([expect.objectContaining({ code: 'US' })]),
    })
    expect(currencies).toMatchObject({ success: true, page_info: { has_next_page: true } })
    expect(stats).toMatchObject({ success: true, post_count: expect.any(Number) })
  })

  it.each(KINDS)('%s searches the crawled web and matches a page by its url', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, READ)
    const word = createRandomString(10).toLowerCase()
    const hostname = `e2e-web-${word}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, crawlable: true })
    const urlId = await insertTestUrl({ url: `https://${hostname}/${word}`, hostnameId })

    const page = await readTool(token, 'search_web', { query: word })

    expect(page).toMatchObject({
      success: true,
      results: [{ url: { id: urlId }, match_type: 'url', snippet: null }],
    })
  })

  it.each(KINDS)(
    '%s lists the eight tools with their schemas and nothing without the scopes',
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
      const unrelated = await listTools(await issueCredential(kind, user, ['hostnames:read']))

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
    const token = await issueCredential('oauth', user, ['reference-data:read'])

    const response = await postMcp(token, toolCall('search_web', { query: 'anything' })).expect(403)

    expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"')
    expect(response.headers['www-authenticate']).toContain('web-search:read')
  })

  it('api_key keeps a call that lacks the scope in-band and returns no data', async () => {
    const user = await createTestUser()
    const token = await issueCredential('api_key', user, ['reference-data:read'])

    const response = await postMcp(token, toolCall('get_my_referral_links', {})).expect(200)

    expect(response.body).toMatchObject({ error: { code: -32600 } })
    expect(response.body).not.toHaveProperty('result')
  })

  it.each(KINDS)('%s is rejected once its owner is suspended', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, READ)
    await readTool(token, 'list_countries')
    await suspendTestUser(user.id)

    await postMcp(token, toolCall('list_countries', {})).expect(401)
  })
})
