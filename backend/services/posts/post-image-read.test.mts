import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { getPostImages } from './post-image-read.mts'

describe('getPostImages edge enforcement modes', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['off', true],
    ['report', true],
    ['enforce', false],
  ] as const)('returns an unregistered image in %s mode: %s', async (mode, visible) => {
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title: `Edge mode ${crypto.randomUUID()}`,
      slug: `edge-mode-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'Post image mode test',
    })
    const imageId = await insertTestImage(user.id)
    await insertTestPostImage({ postId, imageId })
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', mode)
    if (mode !== 'off') {
      vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
      vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
      vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
      vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    }
    const images = await getPostImages(postId)
    expect(images.some(image => image.image_id === imageId)).toBe(visible)
  })
})
