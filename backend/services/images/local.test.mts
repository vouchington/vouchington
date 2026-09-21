import assert from 'node:assert'
import { it, expect, describe } from 'vitest'
import { createPostModerationContent } from '@services/posts/content'
import { getPostModerationInput } from '@services/posts/moderation-input'
import {
  createTestUser,
  getPostLLMModerationContentSha256,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { deleteImageById } from './delete.mts'
import { getImageByAny } from './get.mts'

describe('local', () => {
  it('deleteImageById - handles non-existent image gracefully', async () => {
    await expect(deleteImageById('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined()
  })

  it('deleteImageById - requeues moderation for posts using the deleted image', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const suffix = Math.random().toString(36).slice(2, 10)
    const postId = await insertTestPost({
      title: `Deleted image moderation ${suffix}`,
      slug: `deleted-image-moderation-${suffix}`,
      createdById: creator!.id,
      markdown: 'Post body with deleted image',
      clearanceStatus: 'pending',
    })
    const imageId = await insertTestImage(creator!.id)
    await insertTestPostImage({ postId, imageId })

    await deleteImageById(imageId)

    const post = await getPostModerationInput(postId)
    assert(post)
    const { content_sha256 } = createPostModerationContent(post)
    await expect(getPostLLMModerationContentSha256(postId)).resolves.toEqual(content_sha256)
  })

  it('getImageByAny - handles empty string', async () => {
    const found = await getImageByAny('')
    expect(found).toBeNull()
  })

  it('getImageByAny - handles null', async () => {
    const found = await getImageByAny(null as unknown as string)
    expect(found).toBeNull()
  })

  it('getImageByAny - handles undefined', async () => {
    const found = await getImageByAny(undefined as unknown as string)
    expect(found).toBeNull()
  })

  it('getImageByAny - handles invalid UUID format', async () => {
    const found = await getImageByAny('not-a-uuid')
    expect(found).toBeNull()
  })

  it('getImageByAny - handles invalid SHA256 hex', async () => {
    const found = await getImageByAny('notahexstring')
    expect(found).toBeNull()
  })

  it('getImageByAny - returns null for non-existent image', async () => {
    const found = await getImageByAny('00000000-0000-0000-0000-000000000000')
    expect(found).toBeNull()
  })
})
