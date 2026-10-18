import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createApiKey } from '@services/api-keys'
import { caches } from '@services/entity-cache/caches'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

describe('MCP shared loader boundaries over HTTP', () => {
  it('returns independently addressed member pages for a batch of tool calls', async () => {
    const requester = await createTestUser()
    const firstOwner = await createTestUser()
    const secondOwner = await createTestUser()
    const first = await insertTestCommunity({ createdById: firstOwner.id })
    const second = await insertTestCommunity({ createdById: secondOwner.id })
    await insertTestCommunityMember({ communityId: first.id, userId: firstOwner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: second.id,
      userId: secondOwner.id,
      role: 'owner',
    })
    await caches.users_public.delete(firstOwner.id, secondOwner.id)
    const { rawKey } = await createApiKey(requester.id, 'mcp', 'Independent member reads', [
      'communities:read',
    ])
    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send(
        [first, second].map((community, index) => ({
          jsonrpc: '2.0',
          id: index + 41,
          method: 'tools/call',
          params: {
            name: 'read_community',
            arguments: optionArgs('members', { community_id: community.id }),
          },
        })),
      )
      .expect(200)
    expect(response.body).toMatchObject([
      {
        id: 41,
        result: {
          structuredContent: {
            success: true,
            results: [{ user_id: firstOwner.id, username: firstOwner.username, role: 'owner' }],
          },
        },
      },
      {
        id: 42,
        result: {
          structuredContent: {
            success: true,
            results: [{ user_id: secondOwner.id, username: secondOwner.username, role: 'owner' }],
          },
        },
      },
    ])
  })

  it('creates a community post through delegated membership locks', async () => {
    const owner = await createTestPlusMcpCaller()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const { rawKey } = await createApiKey(owner.id, 'mcp', 'Delegated community create', [
      'communities:read',
      'posts:read',
      'posts:write',
    ])
    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({
        jsonrpc: '2.0',
        id: 43,
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            idempotency_key: randomUUID(),
            community_id: community.id,
            post_type: 'discussion',
            title: `Community boundary ${randomUUID()}`,
            markdown: 'Community discussion.',
          },
        },
      })
      .expect(200)
    expect(response.body).toMatchObject({
      id: 43,
      result: {
        structuredContent: {
          success: true,
          post: { post_type: 'discussion' },
        },
      },
    })
    const post = await getPostByAny(response.body.result.structuredContent.post.id)
    expect(post?.community_id).toBe(community.id)
  })
})
