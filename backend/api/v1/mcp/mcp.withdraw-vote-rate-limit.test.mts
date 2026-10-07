import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkUsageQuota } from '@services/route-rate-limits'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  chargeElectionVoteRateLimit,
  ENTITY_RELATION_VOTE_RATE_LIMIT_PREFIX,
} from '@services/elections-votes/shared'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { settleMeteredMcpResponses } from '@voucha/test-helpers/mcp-usage-meter'
import { issueTestOAuthTokens } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

type ToolResponse = {
  result: { isError?: boolean; content: Array<{ text: string }> }
}

const PREFIX = ENTITY_RELATION_VOTE_RATE_LIMIT_PREFIX

async function createRelation() {
  const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  const suffix = crypto.randomUUID().slice(0, 8)
  const [subject, object] = await Promise.all(
    ['from', 'to'].map(role =>
      insertTestPost({
        title: `Vote limit ${role} ${suffix}`,
        slug: `vote-limit-${role}-${suffix}`,
        createdById: owner.id,
        markdown: 'Test content',
      }),
    ),
  )
  const metadata = entityRelationMetadatum.find(
    item =>
      item.subject_type === 'post' && item.object_type === 'post' && item.predicate === 'related',
  )!
  const [relation] = await upsertEntityRelation(owner, metadata, { id: subject! }, [
    { id: object! },
  ])
  return relation!.id as string
}

async function caller() {
  const user = await createTestPlusMcpCaller()
  const token = (await issueTestOAuthTokens(user)).access_token
  const rest = createRequest()
  await rest.authenticateAs(user)
  return { user, token, rest }
}

function withdraw(token: string, id: string, requestId = 1) {
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send({
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: { name: 'withdraw_entity_relation_vote', arguments: { id } },
    })
}

function withdrawBatch(token: string, id: string) {
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/call' }
  return createRequest()
    .post('/api/v1/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send([
      { ...message, params: { name: 'withdraw_entity_relation_vote', arguments: { id } } },
      { ...message, params: { name: 'withdraw_entity_relation_vote', arguments: { id } } },
    ])
}

function refusalOf(body: ToolResponse) {
  expect(body.result.isError).toBe(true)
  return (JSON.parse(body.result.content[0]!.text) as { error: unknown }).error
}

async function fillVoteBudget(userId: string, spent = 29) {
  for (let index = 0; index < spent; index++) {
    expect((await chargeElectionVoteRateLimit(PREFIX, userId, undefined, null)).limited).toBe(false)
  }
}

describe('MCP withdraw vote shares the REST vote budget', () => {
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>
  const suspended: string[] = []

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
  })

  afterEach(async () => {
    await Promise.all(suspended.splice(0).map(unsuspendTestUser))
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('refuses MCP after REST spends the final vote, with rate-limited audit and zero usage', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    const { user, token, rest } = await caller()
    const relationId = await createRelation()
    await fillVoteBudget(user.id)

    await rest.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(204)
    const response = await settleMeteredMcpResponses(() => withdraw(token, relationId).expect(200))
    expect(refusalOf(response.body as ToolResponse)).toMatchObject({
      status: 429,
      code: 'RATE_LIMIT',
      retryable: true,
      retryAfterSeconds: 60,
    })
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
      'rate_limited',
    ])
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 1, windowSeconds: 900 })).limited,
    ).toBe(false)
  }, 30_000)

  it('refuses REST after MCP spends the final vote', async () => {
    const { user, token, rest } = await caller()
    const relationId = await createRelation()
    await fillVoteBudget(user.id)

    const admitted = await withdraw(token, relationId).expect(200)
    expect((admitted.body as ToolResponse).result.isError).toBeUndefined()
    await rest.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(429)
  }, 30_000)

  it('does not spend a vote for malformed, missing or suspended targets', async () => {
    const { user, token, rest } = await caller()
    const relationId = await createRelation()
    await fillVoteBudget(user.id)

    expect((await withdraw(token, 'bad-id').expect(200)).body).toHaveProperty('error')
    expect(
      refusalOf((await withdraw(token, crypto.randomUUID()).expect(200)).body as ToolResponse),
    ).toMatchObject({ status: 404 })
    await suspendTestUser(user.id)
    suspended.push(user.id)
    await withdraw(token, relationId).expect(401)
    await unsuspendTestUser(user.id)
    suspended.pop()

    const resumedToken = (await issueTestOAuthTokens(user)).access_token
    expect(
      (await withdraw(resumedToken, relationId).expect(200)).body.result.isError,
    ).toBeUndefined()
    await rest.delete(`/api/v1/entity-relations/${relationId}/vote`).expect(429)
  }, 30_000)

  it('counts duplicate-id batch messages separately when only the later vote is refused', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    const { user, token } = await caller()
    const relationId = await createRelation()
    await fillVoteBudget(user.id)

    await settleMeteredMcpResponses(() => withdrawBatch(token, relationId).expect(200))
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
      'accepted',
      'rate_limited',
    ])
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 1, windowSeconds: 900 })).limited,
    ).toBe(true)
  }, 30_000)

  it('charges zero for duplicate-id batch messages that are all refused in-tool', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    const { user, token } = await caller()
    const relationId = await createRelation()
    await fillVoteBudget(user.id, 30)

    await settleMeteredMcpResponses(() => withdrawBatch(token, relationId).expect(200))
    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'accepted',
      'accepted',
      'rate_limited',
      'rate_limited',
    ])
    expect(
      (await checkUsageQuota('mcp_user', user.id, { limit: 1, windowSeconds: 900 })).limited,
    ).toBe(false)
  }, 30_000)
})
