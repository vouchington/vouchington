import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
  readTestContentProvenance,
  executeTestAdmittedPost,
} from '@voucha/test-helpers'
import { getTestOAuthClientRowId } from '@voucha/test-helpers/entities/oauth-client-management'
import { createTestPendingOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { runWithCredentialRequestContext } from '@modules/request-client-info'
import { admitDelegatedContribution } from '@services/contribution-gating'
import createTool from '../create-topic-recommendation.mts'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createRequest } from '@voucha/test-helpers/api/server'

const SCOPES = ['topic-recommendations:read', 'topic-recommendations:write'] as const
const TOOL = 'create_topic_recommendation'
const body = () => {
  const slug = `mcp-topic-${crypto.randomUUID()}`
  return { markdown: 'A useful topic', topic_title: slug, topic_slug: slug }
}
const args = () => ({ ...body(), idempotency_key: crypto.randomUUID() })
async function caller() {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}

describe('MCP recommendation creation — real admission', () => {
  it('refuses direct calls without delegated invocation context or with another owner', async () => {
    const user = await caller()
    await expect(createTool.function(user)(args())).rejects.toMatchObject({
      status: 403,
      message: 'Delegated tool context is required',
    })
    await expect(
      createTool.function(user)(args(), {
        credentialOwnerId: crypto.randomUUID(),
        grantedScopes: SCOPES,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
  })

  it('records the issuing OAuth client with the MCP channel', async () => {
    const user = await caller()
    const { client } = await createTestPendingOAuthAuthorization(user)
    const clientId = await getTestOAuthClientRowId(client.client_id)
    const result = await runWithCredentialRequestContext(
      {
        interface: 'mcp',
        credential: 'oauth',
        client: null,
        oauthClientId: clientId,
      },
      () =>
        createTool.function(user)(args(), { credentialOwnerId: user.id, grantedScopes: SCOPES }),
    )
    expect(await readTestContentProvenance('posts', result.post.id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: clientId,
    })
  })

  it('reports a concurrent admission code and retry delay through MCP', async () => {
    const user = await caller()
    const { idempotency_key, ...requestBody } = args()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = admitDelegatedContribution({
      authority: { kind: 'delegated', credentialOwnerId: user.id },
      currentUser: user,
      membershipPlan: 'plus',
      source: 'topic_recommendation',
      scope: 'topic_recommendation',
      postType: 'topic_recommendation',
      idempotencyKey: idempotency_key,
      intent: { route: 'topic-recommendations.create', body: requestBody },
      beforeCapacity: async () => {
        started.resolve()
        await release.promise
      },
      execute: executeTestAdmittedPost,
    })
    await started.promise
    try {
      const text = await callRejectedMcpTool(
        user,
        TOOL,
        { ...requestBody, idempotency_key },
        SCOPES,
      )
      expect(JSON.parse(text)).toMatchObject({
        error: {
          code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
          retryable: true,
          retryAfterSeconds: expect.any(Number),
        },
      })
    } finally {
      release.resolve()
      await first
    }
  })
  it('creates a recommendation and replays the same durable REST identity', async () => {
    const user = await caller()
    const input = args()
    const first = await callStructuredMcpTool(user, TOOL, input, SCOPES)
    expect(first.post).toMatchObject({ post_type: 'topic_recommendation', created_by_id: user.id })
    expect(await readTestContentProvenance('posts', (first.post as { id: string }).id)).toEqual({
      createdVia: 'mcp',
      oauthClientId: null,
    })
    expect(first).toEqual(await callStructuredMcpTool(user, TOOL, input, SCOPES))
    const { idempotency_key, ...requestBody } = input
    const request = createRequest()
    await request.authenticateAs(user)
    const rest = await request
      .post('/api/v1/topic-recommendations')
      .set('Idempotency-Key', idempotency_key)
      .send(requestBody)
      .expect(201)
    expect((first.post as { id: string }).id).toBe(rest.body.post.id)
    expect(
      await callRejectedMcpTool(user, TOOL, { ...input, markdown: 'Changed' }, SCOPES),
    ).toContain('IDEMPOTENCY_KEY_REUSED')
  })

  it.each([undefined, '', 'not-a-uuid', 42])(
    'refuses invalid idempotency key %s before admission',
    async key => {
      expect(
        await callRejectedMcpTool(
          await caller(),
          TOOL,
          { ...body(), idempotency_key: key },
          SCOPES,
        ),
      ).toContain('Invalid tool arguments')
    },
  )

  it('reports UUID URNs passing schema format as a non-retryable invalid input', async () => {
    const text = await callRejectedMcpTool(
      await caller(),
      TOOL,
      { ...body(), idempotency_key: `urn:uuid:${crypto.randomUUID()}` },
      SCOPES,
    )
    expect(JSON.parse(text)).toEqual({
      error: { status: 422, code: 'INVALID_INPUT', message: 'Invalid UUID', retryable: false },
    })
  })

  it('requires write consent and the Plus plan', async () => {
    const user = await caller()
    expect(await callRejectedMcpTool(user, TOOL, args(), ['topic-recommendations:read'])).toContain(
      'Tool requires scopes',
    )
    expect(
      await callRejectedMcpTool({ ...user, membership_plan: null }, TOOL, args(), SCOPES),
    ).toContain('requires a higher plan')
  })

  it('refuses a suspended credential owner', async () => {
    const user = await caller()
    await suspendTestUser(user.id)
    try {
      expect(await callRejectedMcpTool(user, TOOL, args(), SCOPES)).toContain('suspended')
    } finally {
      await unsuspendTestUser(user.id)
    }
  })
})
