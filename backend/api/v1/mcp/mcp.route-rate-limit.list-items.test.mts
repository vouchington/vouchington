import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import type { PrivateUser } from '@services/users/types'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import {
  createTestPost,
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { createOwnedList, searchListItems } from '@services/lists'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

type ToolResponse = {
  result: { isError?: boolean; content: Array<{ text: string }>; structuredContent?: unknown }
}

const RATE_LIMIT_REFUSAL = {
  status: 429,
  code: 'RATE_LIMIT',
  message: 'Rate limit exceeded. Please try again later.',
  retryable: true,
}

describe('weighted add_list_item route charging', () => {
  let original: {
    route: ReturnType<typeof routeRateLimitConfig.getFields>
    user: ReturnType<typeof rateLimitConfig.getFields>
  }
  let author: PrivateUser

  function admitWriteCalls(admitted: number) {
    const threshold = admitted + 1
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_write: threshold,
    })
    overrideDynamicConfigFieldsForTest(rateLimitConfig, {
      write_tier0: threshold,
      write_tier1: threshold,
      write_tier2: threshold,
      write_tier3: threshold,
      write_tier4: threshold,
      write_tier5: threshold,
    })
  }

  const newPostId = async () => (await createTestPost({ user: author }))!.id

  const mcpPost = (token: string, body: unknown) =>
    createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object)

  const toolCall = (args: Record<string, unknown>) => ({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'add_list_item', arguments: args },
  })

  async function callerWithToken() {
    const user = await createTestPlusMcpCaller()
    return { user, token: (await issueTestOAuthTokens(user)).access_token }
  }

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()
    original = { route: routeRateLimitConfig.getFields(), user: rateLimitConfig.getFields() }
    author = await createTestUser()
  }, 5_000)

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, original.route)
    overrideDynamicConfigFieldsForTest(rateLimitConfig, original.user)
  }, 5_000)

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig])
  }, 5_000)

  it('charges each target and refuses later route writes after the weighted batch', async () => {
    admitWriteCalls(2)
    const { user, token } = await callerWithToken()
    const rest = createRequest()
    await rest.authenticateAs(user)
    const list = await createOwnedList(user.id, WEB_PROVENANCE, { name: 'Weighted MCP list' })
    const postIds = [await newPostId(), await newPostId(), await newPostId()]

    const batch = await mcpPost(
      token,
      toolCall({
        list_id: list.id,
        items: postIds.slice(0, 2).map(entity => ({ item_type: 'post', entity })),
      }),
    ).expect(200)
    expect((batch.body as ToolResponse).result.isError).toBeUndefined()
    expect((batch.body as ToolResponse).result.structuredContent).toMatchObject({
      success: true,
      results: [{ status: 'added' }, { status: 'added' }],
    })
    await rest
      .post(`/api/v1/lists/${list.id}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postIds[2] })
      .expect(429)
    expect((await searchListItems(list.id, { currentUserId: user.id })).results).toHaveLength(2)
  })

  it('rejects a batch whose full target weight exceeds remaining capacity before writing', async () => {
    admitWriteCalls(2)
    const { user, token } = await callerWithToken()
    const rest = createRequest()
    await rest.authenticateAs(user)
    const list = await createOwnedList(user.id, WEB_PROVENANCE, {
      name: 'Refused weighted MCP list',
    })
    const postIds = [await newPostId(), await newPostId(), await newPostId()]

    await rest
      .post(`/api/v1/lists/${list.id}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postIds[0] })
      .expect(201)
    const response = await mcpPost(
      token,
      toolCall({
        list_id: list.id,
        items: postIds.slice(1).map(entity => ({ item_type: 'post', entity })),
      }),
    ).expect(200)
    const result = (response.body as ToolResponse).result
    expect(result.isError).toBe(true)
    const refusal = JSON.parse(result.content[0]!.text) as {
      error: typeof RATE_LIMIT_REFUSAL & { retryAfterSeconds: number }
    }
    expect(refusal.error).toMatchObject(RATE_LIMIT_REFUSAL)
    const limitedRest = await rest
      .post(`/api/v1/lists/${list.id}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postIds[2] })
      .expect(429)
    expect(refusal.error.retryAfterSeconds).toBe(Number(limitedRest.headers['retry-after']))
    expect((await searchListItems(list.id, { currentUserId: user.id })).results).toHaveLength(1)
  })
})
