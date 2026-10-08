import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
} from '@voucha/test-helpers'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'

describe('preparePostImageDeliveryMutation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns without locking when edge enforcement is off', async () => {
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', 'off')
    await expect(
      preparePostImageDeliveryMutation(
        {
          async query() {
            throw new Error('post image delivery must not query when enforcement is off')
          },
        } as never,
        { imageIds: ['00000000-0000-7000-8000-000000000001'] },
      ),
    ).resolves.toBeUndefined()
  })

  it.each(['report', 'enforce'])('locks and pre-denies attached images in %s mode', async mode => {
    const user = await createTestUserDirect()
    const [postId, imageId] = await Promise.all([
      insertTestPost({
        title: `post delivery ${crypto.randomUUID()}`,
        slug: `post-delivery-${crypto.randomUUID()}`,
        createdById: user.id,
        markdown: 'image',
      }),
      insertTestImage(user.id),
    ])
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', mode)
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    await using transaction = await beginTransaction()
    await expect(
      preparePostImageDeliveryMutation(transaction, {
        postId,
        imageIds: [imageId],
        retainImageIds: [],
      }),
    ).resolves.toBeUndefined()
    await transaction.rollback()
  })
})
