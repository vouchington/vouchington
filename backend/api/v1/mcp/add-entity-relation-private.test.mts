import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestMembership,
  createTestPost,
  createTestUserWithAge,
  getPostHashtagSourcesForTest,
  getTopicAliasIdForTest,
} from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { ApiScope } from '@modules/scopes'
import {
  exchangeOAuthAuthorizationCode,
  revokeOAuthToken,
} from '@services/oauth-authorization-server'
import {
  createTestApprovedOAuthAuthorization,
  issueTestOAuthTokens,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

const ordinaryScopes = ['entity-relations:read', 'entity-relations:write'] as const
const exactScopes = [...ordinaryScopes, 'post-relations.owned-private:write'] as const

function toolCall(postId: string, tag: string) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'add_entity_relation', arguments: { action: 'add_tag', post_id: postId, tag } },
  }
}

function postMcp(token: string, body: unknown) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object)
}

async function issueCredential(
  kind: 'api_key' | 'oauth',
  user: PrivateUser,
  scopes: readonly ApiScope[],
): Promise<string> {
  if (kind === 'oauth') {
    const tokens = await issueTestOAuthTokens(user, { scope: scopes.join(' ') })
    return tokens.access_token
  }
  const { rawKey } = await createApiKey(
    user.id,
    'mcp',
    `Private relation ${createRandomString(6)}`,
    [...scopes],
  )
  return rawKey
}

describe('add_entity_relation private hashtag over MCP HTTP', () => {
  it.each(['api_key', 'oauth'] as const)(
    '%s requires the literal private grant and still hides foreign private posts',
    async kind => {
      const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      await createTestMembership({ user_id: owner.id, plan: 'plus' })
      const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'users' })
      const suffix = createRandomString(8).toLowerCase()
      const deniedTag = `denied-${suffix}`
      const allowedTag = `allowed-${suffix}`
      const broad = await issueCredential(kind, owner, ordinaryScopes)

      const denied = await postMcp(broad, toolCall(post.id, `#${deniedTag}`)).expect(200)
      expect(denied.body).toMatchObject({ result: { isError: true } })
      expect(await getTopicAliasIdForTest(deniedTag)).toBeNull()
      expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])

      const exact = await issueCredential(kind, owner, exactScopes)
      const allowed = await postMcp(exact, toolCall(post.id, `#${allowedTag}`)).expect(200)
      const result = allowed.body as {
        result?: { content?: Array<{ text?: string }>; isError?: boolean }
      }
      expect(result.result?.isError).toBeUndefined()
      expect(JSON.parse(result.result?.content?.[0]?.text ?? '{}')).toMatchObject({
        post_id: post.id,
        tag: allowedTag,
        topic_alias_id: expect.any(String),
      })
      expect(await getPostHashtagSourcesForTest(post.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ alias: allowedTag, source: 'explicit' }),
        ]),
      )

      const stranger = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const hidden = await createTestPost({
        user: stranger,
        privacy: 'private',
        broadcast: 'followers',
      })
      const hiddenTag = `hidden-${suffix}`
      const foreign = await postMcp(exact, toolCall(hidden.id, `#${hiddenTag}`)).expect(200)
      expect(foreign.body).toMatchObject({ result: { isError: true } })
      expect(JSON.stringify(foreign.body)).not.toContain(hidden.id)
      expect(await getTopicAliasIdForTest(hiddenTag)).toBeNull()
      expect(await getPostHashtagSourcesForTest(hidden.id)).toEqual([])
    },
  )

  it('rejects a revoked OAuth token before the private write', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: owner.id, plan: 'plus' })
    const post = await createTestPost({ user: owner, privacy: 'private', broadcast: 'users' })
    const flow = await createTestApprovedOAuthAuthorization(owner, { scope: exactScopes.join(' ') })
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.access_token })
    const tag = `revoked-${createRandomString(8).toLowerCase()}`
    await postMcp(tokens.access_token, toolCall(post.id, `#${tag}`)).expect(401)
    expect(await getTopicAliasIdForTest(tag)).toBeNull()
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])
  })

  it('does not list or call the paid relation tool on a free plan', async () => {
    const free = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const token = await issueCredential('api_key', free, ordinaryScopes)
    const listed = await postMcp(token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }).expect(200)
    const body = listed.body as { result?: { tools?: Array<{ name: string }> } }
    expect(body.result?.tools?.map(tool => tool.name)).not.toContain('add_entity_relation')

    const post = await createTestPost({ user: free })
    const tag = `free-${createRandomString(8).toLowerCase()}`
    const called = await postMcp(token, toolCall(post.id, `#${tag}`)).expect(200)
    expect(called.body).toMatchObject({ error: { code: -32600 } })
    expect(await getTopicAliasIdForTest(tag)).toBeNull()
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])
  })
})
