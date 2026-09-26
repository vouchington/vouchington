/**
 * Tests for POST /api/v1/mcp
 *
 * The MCP endpoint uses Bearer API-key auth (not session cookies).
 * We use real DB/Valkey and real API keys, mocking nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestMembership,
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  createTestUserWithAge,
  getEntityRelation,
  getPostHashtagSourcesForTest,
  getTopicAliasIdForTest,
} from '@voucha/test-helpers'
import { createApiKey, revokeApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }

function toolCall(args: Record<string, unknown>, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'add_entity_relation', arguments: args },
  }
}

describe('POST /api/v1/mcp', () => {
  let user: PrivateUser
  let validKey: string

  beforeAll(async () => {
    user = await createTestUser()
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Test MCP Key', ['mcp.user:read'])
    validKey = rawKey
  })

  it('returns 415 when Content-Type is not application/json', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'text/plain')
      .set('Authorization', `Bearer ${validKey}`)
      .send('hello')
      .expect(415)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('does not disclose malformed MCP schemas before API-key authentication', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { arguments: {} } })
      .expect(401)

    expect(response.text).not.toContain('Invalid request')
    expect(response.text).not.toContain('tools/call')
  })

  it('returns 401 when Authorization is not Bearer format', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 401 when API key is invalid', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer voucha_mcp_00000000000000000000000000000000_0000000000000000')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 200 with tools list for valid key', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)

    const body = response.body as { result?: { tools?: unknown[] } }
    expect(Array.isArray(body.result?.tools)).toBe(true)
  })

  it('adds a relation to another user public post when ordinary REST policy allows it', async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: contributor.id, plan: 'plus' })
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user: author })
    const urlId = await createTestUrlWithHostname()
    const { rawKey } = await createApiKey(contributor.id, 'mcp', 'Relation MCP Key', [
      'entity-relations:read',
      'entity-relations:write',
    ])

    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send(
        toolCall({
          action: 'add_relation',
          entity_type: 'post',
          entity_id: post.id,
          predicate: 'related',
          object_type: 'url',
          object_id: urlId,
        }),
      )
      .expect(200)

    const body = response.body as { result?: { content?: Array<{ text?: string }> } }
    expect(JSON.parse(body.result?.content?.[0]?.text ?? '{}')).toMatchObject({
      subject_id: post.id,
      object_id: urlId,
      predicate: 'related',
    })
  })

  it('creates a missing hashtag only for its post author', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: author.id, plan: 'plus' })
    const post = await createTestPost({ user: author })
    const tag = `mcp-new-tag-${post.id.slice(-8)}`
    const { rawKey } = await createApiKey(author.id, 'mcp', 'Tag MCP Key', [
      'entity-relations:read',
      'entity-relations:write',
    ])

    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send(toolCall({ action: 'add_tag', post_id: post.id, tag: `#${tag}` }))
      .expect(200)

    const body = response.body as { result?: { content?: Array<{ text?: string }> } }
    expect(JSON.parse(body.result?.content?.[0]?.text ?? '{}')).toMatchObject({
      post_id: post.id,
      tag,
      topic_alias_id: expect.any(String),
    })
    expect(await getTopicAliasIdForTest(tag)).toEqual(expect.any(String))
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ alias: tag, source: 'explicit' })]),
    )
  })

  it('keeps insufficient API-key scopes in-band and rejects closed extra keys before writes', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const post = await createTestPost({ user })
    const urlId = await createTestUrlWithHostname()
    const tag = `mcp-closed-${post.id.slice(-8)}`
    const { rawKey: underScoped } = await createApiKey(user.id, 'mcp', 'Under-scoped MCP Key', [
      'topics:read',
    ])
    const { rawKey: scoped } = await createApiKey(user.id, 'mcp', 'Scoped MCP Key', [
      'entity-relations:read',
      'entity-relations:write',
    ])

    const scopeResponse = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${underScoped}`)
      .send(toolCall({}))
      .expect(200)
    expect(scopeResponse.body).toMatchObject({ error: { code: -32600 } })

    const extraKeyResponse = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${scoped}`)
      .send(
        toolCall({
          action: 'add_relation',
          entity_type: 'post',
          entity_id: post.id,
          predicate: 'related',
          object_type: 'url',
          object_id: urlId,
          unexpected: true,
        }),
      )
      .expect(200)
    expect(extraKeyResponse.body).toMatchObject({ error: { code: -32602 } })
    expect(await getEntityRelation('relation__post__related__url', post.id, urlId)).toHaveLength(0)
    expect(await getTopicAliasIdForTest(tag)).toBeNull()
  })

  it('rejects a revoked relation credential before it can write', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const post = await createTestPost({ user })
    const urlId = await createTestUrlWithHostname()
    const { rawKey, apiKey } = await createApiKey(user.id, 'mcp', 'Revoked relation key', [
      'entity-relations:read',
      'entity-relations:write',
    ])
    await revokeApiKey(user.id, apiKey.id)

    await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send(
        toolCall({
          action: 'add_relation',
          entity_type: 'post',
          entity_id: post.id,
          predicate: 'related',
          object_type: 'url',
          object_id: urlId,
        }),
      )
      .expect(401)
    expect(await getEntityRelation('relation__post__related__url', post.id, urlId)).toHaveLength(0)
  })

  it('accepts a case-insensitive bearer authorization scheme', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)
  })

  it('does not expose admin MCP tools on the user MCP endpoint', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)

    const body = response.body as { result?: { tools?: Array<{ name?: string }> } }
    expect(body.result?.tools?.map(tool => tool.name)).not.toContain('search_support_messages')
  })

  it('returns 405 for GET /api/v1/mcp', async () => {
    const req = createRequest()
    const response = await req.get('/api/v1/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })

  it('returns 405 for DELETE /api/v1/mcp', async () => {
    const req = createRequest()
    const response = await req.delete('/api/v1/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })
})
