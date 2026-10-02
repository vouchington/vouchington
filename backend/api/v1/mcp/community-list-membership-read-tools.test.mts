import type { ApiScope } from '@modules/scopes'
import { addListItem } from '@services/lists'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestCommunityMember,
  insertTestList,
  insertTestPost,
  insertTestTopic,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { describe, expect, it } from 'vitest'

type Kind = 'api_key' | 'oauth'
type Body = Record<string, unknown>
type ToolResult = { isError?: boolean; structuredContent?: Body }

const KINDS = ['api_key', 'oauth'] as const satisfies readonly Kind[]
const READ = [
  'communities:read',
  'lists:read',
  'reference-data:read',
] as const satisfies readonly ApiScope[]
// The private-data grant needs the entity relation scopes it belongs to.
const OWNED_PRIVATE = [
  ...READ,
  'entity-relations:read',
  'entity-relations:write',
  'post-relations.owned-private:write',
] as const
const TOOLS = [
  'get_community_list_items',
  'get_community_list_item_counts',
  'get_my_lists_containing',
  'get_membership_plans',
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

// The structured payload of a tool call that did not fail at the protocol level.
async function readTool(token: string, name: string, args: Body = {}): Promise<Body> {
  const response = await postMcp(token, toolCall(name, args)).expect(200)
  const result = (response.body as { result: ToolResult }).result

  expect(result.isError).toBeUndefined()
  return result.structuredContent!
}

describe('community list item, list membership and membership plan read tools over MCP HTTP', () => {
  it.each(KINDS)('%s reads community list entries, counts and the plans end to end', async kind => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const topicId = await insertTestTopic({
      name: `Over MCP ${createRandomString(6)}`,
      slug: `over-mcp-${createRandomString(8).toLowerCase()}`,
      createdById: owner.id,
    })
    const item = await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topicId,
    })
    const token = await issueCredential(kind, owner, READ)

    const page = await readTool(token, 'get_community_list_items', {
      community_id: community.slug,
      item_type: 'topic',
    })
    const counts = await readTool(token, 'get_community_list_item_counts', {
      community_id: community.id,
    })
    const plans = await readTool(token, 'get_membership_plans')

    expect(page).toMatchObject({
      success: true,
      results: [{ id: item.id, item_type: 'topic', entity_id: topicId, label: null }],
      page_info: { has_next_page: false },
    })
    expect(counts).toMatchObject({ success: true, topic: 1, post: 0 })
    expect(plans).toMatchObject({ success: true, products: expect.any(Array) })
  })

  it.each(KINDS)(
    '%s finds the lists holding a post, private ones only with the grant',
    async kind => {
      const owner = await createTestUser()
      const postId = await insertTestPost({
        title: `Over MCP ${createRandomString(8)}`,
        slug: `over-mcp-post-${createRandomString(8).toLowerCase()}`,
        createdById: owner.id,
        markdown: 'Body of the post',
      })
      const [open, hidden] = await Promise.all(
        (['public', 'private'] as const).map(visibility =>
          insertTestList({ ownerUserId: owner.id, name: `Over MCP ${visibility}`, visibility }),
        ),
      )
      await Promise.all([open!, hidden!].map(list => addListItem(list.id, 'post', postId)))
      const args = { item_type: 'post', entity_id: postId }

      const plain = await readTool(
        await issueCredential(kind, owner, READ),
        'get_my_lists_containing',
        args,
      )
      const granted = await readTool(
        await issueCredential(kind, owner, OWNED_PRIVATE),
        'get_my_lists_containing',
        args,
      )

      expect(plain).toEqual({ success: true, list_ids: [open!.id] })
      expect((granted['list_ids'] as string[]).toSorted()).toEqual(
        [open!.id, hidden!.id].toSorted(),
      )
    },
  )

  it.each(KINDS)(
    '%s lists the four tools with their schemas and nothing without the scopes',
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

  it.each(KINDS)('%s is rejected once its owner is suspended', async kind => {
    const user = await createTestUser()
    const token = await issueCredential(kind, user, READ)
    await readTool(token, 'get_membership_plans')
    await suspendTestUser(user.id)

    await postMcp(token, toolCall('get_membership_plans', {})).expect(401)
  })
})
