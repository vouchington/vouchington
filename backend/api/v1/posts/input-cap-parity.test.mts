import { describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'

describe('post input cap protocol parity', () => {
  it.each([
    {
      code: 'POST_IMAGE_LIMIT_REACHED',
      status: 400,
      input: {
        images: Array.from({ length: 21 }, (_, order_index) => ({
          image_id: crypto.randomUUID(),
          order_index,
        })),
      },
    },
    {
      code: 'POST_CATEGORY_LIMIT_REACHED',
      status: 400,
      input: {
        categories: Array.from({ length: 21 }, (_, index) => ({
          type: 'hashtag',
          hashtag: `#capacity-${index}`,
        })),
      },
    },
  ])('preserves $code across REST and MCP post creation', async ({ code, status, input }) => {
    const user = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const request = createRequest()
    await request.authenticateAs(user)
    const body = { title: `Input capacity ${crypto.randomUUID()}`, ...input }
    const rest = await request
      .post('/api/v1/posts')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body)
      .expect(status)
    expect(rest.body).toMatchObject({ code })
    const mcp = await callRejectedMcpTool(
      { ...user, membership_plan: 'plus' },
      'create_post',
      { ...body, idempotency_key: crypto.randomUUID() },
      ['posts:read', 'posts:write'],
    )
    expect(JSON.parse(mcp)).toMatchObject({ error: { status, code, retryable: false } })
  })
})
