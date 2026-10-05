import type { ApiScope } from '@modules/scopes'
import { createApiKey } from '@services/api-keys'
import {
  createRandomString,
  createTestPost,
  createTestUser,
  getTestCommunityMember,
  insertTestCommunity,
  insertTestCommunityMember,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { McpContractCaller } from '@voucha/test-helpers/mcp-tool-contract'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { countTestModerationReportsByReporter } from '@voucha/test-helpers/mcp-write-tool-rows'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { describe, expect, it } from 'vitest'

type Kind = 'api_key' | 'oauth'
type Body = Record<string, unknown>
type ToolCallBody = {
  result?: { isError?: boolean; structuredContent?: Body }
  error?: { code: number; message: string }
}

const KINDS = ['api_key', 'oauth'] as const satisfies readonly Kind[]
const WRITE_SCOPES = [
  'reports:write',
  'communities:read',
  'communities:write',
  'disputes:read',
  'disputes:write',
  'appeals:read',
  'appeals:write',
] as const satisfies readonly ApiScope[]
const TOOLS = [
  'create_content_report',
  'create_community',
  'join_community',
  'leave_community',
  'apply_to_community',
  'create_review_dispute',
  'list_my_review_disputes',
  'get_my_review_dispute',
  'create_moderation_appeal',
  'list_my_moderation_appeals',
  'get_my_moderation_appeal',
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

// OAuth grants the whole user audience through the umbrella scopes, so the resource scopes only
// narrow an API key.
async function issueCredential(
  kind: Kind,
  user: McpContractCaller,
  scopes: readonly ApiScope[] = WRITE_SCOPES,
): Promise<string> {
  if (kind === 'oauth') return (await issueTestOAuthTokens(user)).access_token
  const { rawKey } = await createApiKey(user.id, 'mcp', `Write tools ${createRandomString(6)}`, [
    ...scopes,
  ])
  return rawKey
}

// The structured payload of a tool call that did not fail at the protocol level.
async function callOk(token: string, name: string, args: Body): Promise<Body> {
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

const reportArgs = (entityId: string) => ({
  idempotency_key: crypto.randomUUID(),
  entity_type: 'post',
  entity_id: entityId,
  reason: 'spam',
})

describe('community, report and appeal write tools over MCP HTTP', () => {
  it.each(KINDS)('%s files a report as its owner and replays a retry', async kind => {
    const owner = await createTestPlusMcpCaller()
    const postId = (await createTestPost({ user: await createTestUser() }))!.id
    const token = await issueCredential(kind, owner)
    const input = reportArgs(postId)

    const first = await callOk(token, 'create_content_report', input)
    const retry = await callOk(token, 'create_content_report', input)

    expect(first).toMatchObject({
      success: true,
      is_duplicate: false,
      report: { entity_type: 'post', entity_id: postId, reason: 'spam', status: 'pending' },
    })
    expect(retry).toEqual(first)
    expect(await countTestModerationReportsByReporter(owner.id)).toBe(1)
  })

  it.each(KINDS)('%s leaves a community as its owner and nobody else', async kind => {
    const owner = await createTestPlusMcpCaller()
    const stayer = await createTestUser()
    const community = await insertTestCommunity({ createdById: (await createTestUser()).id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: stayer.id })
    const token = await issueCredential(kind, owner)

    const result = await callOk(token, 'leave_community', { community_id: community.slug })

    expect(result).toEqual({ success: true, community_id: community.id })
    expect(await getTestCommunityMember(community.id, owner.id)).toBeNull()
    expect(await getTestCommunityMember(community.id, stayer.id)).not.toBeNull()
  })

  it.each(KINDS)('%s lists every tool its default scopes allow', async kind => {
    const owner = await createTestPlusMcpCaller()

    expect((await listToolNames(await issueCredential(kind, owner))).toSorted()).toEqual(
      TOOLS.toSorted(),
    )
  })

  it('lists only the tools an API key narrowed to one resource scope allows', async () => {
    const owner = await createTestPlusMcpCaller()

    expect(await listToolNames(await issueCredential('api_key', owner, ['reports:write']))).toEqual(
      ['create_content_report'],
    )
  })

  it.each(KINDS)('%s is rejected once its owner is suspended, writing nothing', async kind => {
    const owner = await createTestPlusMcpCaller()
    const postId = (await createTestPost({ user: await createTestUser() }))!.id
    const token = await issueCredential(kind, owner)
    await callOk(token, 'create_content_report', reportArgs(postId))
    const other = (await createTestPost({ user: await createTestUser() }))!.id
    await suspendTestUser(owner.id)

    await callTool(token, 'create_content_report', reportArgs(other)).expect(401)

    expect(await countTestModerationReportsByReporter(owner.id)).toBe(1)
  })
})
