import { validateApiResponseContract } from '@voucha/test-helpers/api-response-contract'
import { countTestPostsCreatedBy } from '@voucha/test-helpers/entities/posts-deletion'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  createTestMembership,
  createTestTopic,
} from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { backendResponseContracts } from '@voucha/test-helpers/api-fixtures/response-contracts'
import { validateResponseContract } from '@voucha/test-helpers/api-fixtures/contract-schema'

const scopes = ['posts:read', 'posts:write'] as const
async function caller() {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' as const }
}
function recommendation() {
  const slug = `public-create-${crypto.randomUUID()}`
  return {
    post_type: 'topic_recommendation' as const,
    markdown: 'A useful proposed topic.',
    topic_title: slug,
    topic_slug: slug,
  }
}

describe('post creation public contract', () => {
  it('publishes accurate ordinary and synthetic honeypot response variants', async () => {
    const user = await caller()
    const request = createRequest()
    await request.authenticateAs(user)
    for (const honeypot of [false, true]) {
      const response = await request
        .post('/api/v1/posts')
        .send({
          post_type: 'discussion',
          title: 'Contract discussion',
          markdown: 'A useful discussion body.',
          ...(honeypot && { hp_website: 'bot.example' }),
        })
        .expect(201)
      expect(validateApiResponseContract('POST:/api/v1/posts', response.body)).toBeNull()
    }
  })

  it('returns the creator recommendation projection without persisted approval metadata, including on replay', async () => {
    const user = await caller()
    const request = createRequest()
    await request.authenticateAs(user)
    const body = recommendation()
    const key = crypto.randomUUID()
    const response = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    const stored = await getPostByAny(response.body.post.id, { readOnly: false })
    expect(stored?.approved_at).toBeTruthy()
    expect(stored?.clearance_updated_at).toBeTruthy()
    expect(response.body.post).toMatchObject({
      created_by_id: user.id,
      post_type: 'topic_recommendation',
      topic_recommendation: {
        status: 'pending',
        reviewed_by_id: null,
        reviewed_at: null,
        rejection_reason: null,
        approval_error_message: null,
      },
    })
    for (const field of [
      'approved_at',
      'rejected_at',
      'in_review_at',
      'clearance_status',
      'clearance_reason',
      'clearance_updated_at',
      'updated_by_id',
      'archived_by_id',
      'locked_by_id',
      'deleted_by_id',
      'ai_summary_markdown',
      'html',
    ]) {
      expect(response.body.post).not.toHaveProperty(field)
    }
    const contract = backendResponseContracts['POST:/api/v1/posts#topic-recommendation']!.schema
    expect(validateResponseContract(contract, response.body)).toEqual([])
    expect(validateApiResponseContract('POST:/api/v1/posts', response.body)).toBeNull()
    expect(
      validateApiResponseContract('POST:/api/v1/posts', {
        post: { ...response.body.post, approved_at: stored!.approved_at },
      }),
    ).not.toBeNull()
    expect(
      validateResponseContract(contract, {
        post: { ...response.body.post, approved_at: stored!.approved_at },
      }),
    ).not.toEqual([])
    const replay = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(replay.body).toEqual(response.body)
  })

  it('keeps MCP creation compact while retaining full recommendation data on by-id reads', async () => {
    const user = await caller()
    const created = await callStructuredMcpTool(
      user,
      'create_post',
      { ...recommendation(), idempotency_key: crypto.randomUUID() },
      scopes,
    )
    const summary = created.post as { id: string }
    expect(summary).toMatchObject({ post_type: 'topic_recommendation' })
    for (const field of [
      'markdown',
      'created_by_id',
      'approved_at',
      'clearance_status',
      'topic_recommendation',
    ])
      expect(summary).not.toHaveProperty(field)
    const detail = await callStructuredMcpTool(
      user,
      'read_posts',
      optionArgs('details', { post_id: summary.id }),
      scopes,
    )
    expect(detail.post).toMatchObject({
      id: summary.id,
      topic_recommendation: { status: 'pending', reviewed_by_id: null },
    })
    expect(detail.post).not.toHaveProperty('approved_at')
  })

  it.each([false, true])(
    'rejects non-review ratings on both transports before persistence (populated=%s)',
    async populated => {
      const user = await caller()
      const topic = await createTestTopic({ user })
      const body = {
        post_type: 'discussion',
        title: 'Invalid rating target',
        markdown: 'Discussion text.',
        review_topic_ratings: populated ? [{ topic_id: topic.id, rating: 5 }] : [],
      }
      const request = createRequest()
      await request.authenticateAs(user)
      const rest = await request.post('/api/v1/posts').send(body).expect(422)
      expect(rest.body.message).toBe('review_topic_ratings is only allowed for review posts')
      expect(
        await callRejectedMcpTool(
          user,
          'create_post',
          { ...body, idempotency_key: crypto.randomUUID() },
          scopes,
        ),
      ).toContain(rest.body.message)
      expect(await countTestPostsCreatedBy(user.id)).toBe(0)
    },
  )
})
