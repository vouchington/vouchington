import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  insertTestImage,
  insertTestPost,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'

describe('image placement capacity protocol parity', () => {
  it('preserves the coded 409 through REST and the real MCP create-post handler', async () => {
    await mediaDeliverySafetyWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        max_placements_per_image: 1,
      }),
    )
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const imageId = await insertTestImage(user.id)
    const ownedPosts = await Promise.all(
      Array.from({ length: 2 }, () =>
        insertTestPost({
          title: `Placement protocol ${crypto.randomUUID()}`,
          slug: crypto.randomUUID(),
          markdown: 'Image placement protocol parity.',
          createdById: user.id,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(user)
    const images = [{ image_id: imageId, order_index: 0, caption: '' }]
    await request.put(`/api/v1/posts/${ownedPosts[0]}/images`).send({ images }).expect(200)
    await request.put(`/api/v1/posts/${ownedPosts[0]}/images`).send({ images }).expect(200)
    const refused = await request
      .put(`/api/v1/posts/${ownedPosts[1]}/images`)
      .send({ images })
      .expect(409)
    expect(refused.body).toMatchObject({ code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
    const mcp = await callRejectedMcpTool(
      { ...user, membership_plan: 'plus' },
      'create_post',
      {
        idempotency_key: crypto.randomUUID(),
        title: `MCP placement cap ${crypto.randomUUID()}`,
        markdown: 'The image already uses its live placement capacity.',
        images,
      },
      ['posts:read', 'posts:write'],
    )
    expect(JSON.parse(mcp)).toMatchObject({
      error: { status: 409, code: 'IMAGE_PLACEMENT_LIMIT_REACHED', retryable: false },
    })
    const unchanged = await request.get(`/api/v1/posts/${ownedPosts[1]}/images`).expect(200)
    expect(unchanged.body.images).toEqual([])
  })
})
