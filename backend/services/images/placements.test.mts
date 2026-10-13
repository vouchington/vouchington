import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { getPostImages, setPostImages } from '@services/posts/images'
import type { Post } from '@services/posts/types'
import { getPostByAny } from '@services/posts/get'
import {
  getImagePlacementForCopyright,
  getImagePlacementsForCopyright,
  getImagePlacementCopyrightOwner,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from './placements.mts'

describe('image placements', () => {
  it('keeps a shared image available through an unaffected post placement', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const [firstPostId, secondPostId] = await Promise.all([
      insertTestPost({
        title: `Placement first ${suffix}`,
        slug: `placement-first-${suffix}`,
        createdById: creator.id,
        markdown: '',
      }),
      insertTestPost({
        title: `Placement second ${suffix}`,
        slug: `placement-second-${suffix}`,
        createdById: creator.id,
        markdown: '',
      }),
    ])
    const [sharedImageId, replacementImageId] = await Promise.all([
      insertTestImage(creator.id),
      insertTestImage(creator.id),
    ])
    await Promise.all([
      insertTestPostImage({ postId: firstPostId, imageId: sharedImageId }),
      insertTestPostImage({ postId: secondPostId, imageId: sharedImageId }),
    ])
    const originalPlacement = (await getPostImages(firstPostId))[0]!
    const secondPlacement = (await getPostImages(secondPostId))[0]!
    const firstPost = (await getPostByAny(firstPostId, { readOnly: false })) as Post

    await setPostImages(creator, firstPost, [{ image_id: replacementImageId, order_index: 0 }])

    await expect(
      getImagePlacementForCopyright(originalPlacement.placement_id),
    ).resolves.toMatchObject({
      imageId: sharedImageId,
      revision: originalPlacement.placement_revision + 1,
      deleted: true,
    })
    await expect(
      getImagePlacementForCopyright(secondPlacement.placement_id),
    ).resolves.toMatchObject({
      imageId: sharedImageId,
      revision: secondPlacement.placement_revision,
      deleted: false,
    })
  })

  it('reads many copyright placements at once, omitting one that does not exist', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const [firstPostId, secondPostId] = await Promise.all([
      insertTestPost({
        title: `Batch first ${suffix}`,
        slug: `batch-first-${suffix}`,
        createdById: creator.id,
        markdown: '',
      }),
      insertTestPost({
        title: `Batch second ${suffix}`,
        slug: `batch-second-${suffix}`,
        createdById: creator.id,
        markdown: '',
      }),
    ])
    const [firstImageId, secondImageId, replacementImageId] = await Promise.all([
      insertTestImage(creator.id),
      insertTestImage(creator.id),
      insertTestImage(creator.id),
    ])
    await Promise.all([
      insertTestPostImage({ postId: firstPostId, imageId: firstImageId }),
      insertTestPostImage({ postId: secondPostId, imageId: secondImageId }),
    ])
    const first = (await getPostImages(firstPostId))[0]!
    const second = (await getPostImages(secondPostId))[0]!
    const firstPost = (await getPostByAny(firstPostId, { readOnly: false })) as Post
    await setPostImages(creator, firstPost, [{ image_id: replacementImageId, order_index: 0 }])
    const missingId = randomUUID()

    const placements = await getImagePlacementsForCopyright([
      first.placement_id,
      missingId,
      second.placement_id,
    ])

    expect([...placements.keys()].toSorted()).toEqual(
      [first.placement_id, second.placement_id].toSorted(),
    )
    expect(placements.get(first.placement_id)).toMatchObject({
      imageId: firstImageId,
      deleted: true,
    })
    expect(placements.get(second.placement_id)).toMatchObject({
      imageId: secondImageId,
      deleted: false,
    })
    await expect(getImagePlacementsForCopyright([])).resolves.toEqual(new Map())
  })

  it('resolves the post owning a placement for durable cache invalidation', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Placement host ${suffix}`,
      slug: `placement-host-${suffix}`,
      createdById: creator.id,
      markdown: '',
    })
    const imageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId })
    const placement = (await getPostImages(postId))[0]!

    await expect(getImagePlacementCopyrightOwner(placement.placement_id)).resolves.toEqual({
      kind: 'post',
      id: postId,
    })
    await expect(getImagePlacementCopyrightOwner(randomUUID())).resolves.toBeNull()
  })

  it('preserves a stable placement identity across idempotent updates and reattachment', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Placement identity ${suffix}`,
      slug: `placement-identity-${suffix}`,
      createdById: creator.id,
      markdown: '',
    })
    const imageId = await insertTestImage(creator.id)
    const post = (await getPostByAny(postId, { readOnly: false })) as Post

    await setPostImages(creator, post, [{ image_id: imageId, order_index: 0 }])
    const initial = (await getPostImages(postId))[0]!
    await setPostImages(creator, post, [{ image_id: imageId, order_index: 0 }])
    const unchanged = (await getPostImages(postId))[0]!
    await setPostImages(creator, post, [])
    await setPostImages(creator, post, [{ image_id: imageId, order_index: 0 }])
    const reattached = (await getPostImages(postId))[0]!

    expect(unchanged).toMatchObject({
      placement_id: initial.placement_id,
      placement_revision: initial.placement_revision,
    })
    expect(reattached).toMatchObject({
      placement_id: initial.placement_id,
      placement_revision: initial.placement_revision + 2,
    })
  })

  it('fences copyright delivery changes by the authoritative placement revision', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Placement fence ${suffix}`,
      slug: `placement-fence-${suffix}`,
      createdById: creator.id,
      markdown: '',
    })
    const imageId = await insertTestImage(creator.id)
    await insertTestPostImage({ postId, imageId })
    const placement = (await getPostImages(postId))[0]!
    const placementId = placement.placement_id

    await expect(
      withholdImagePlacementForCopyright({
        placementId,
        expectedRevision: placement.placement_revision,
      }),
    ).resolves.toMatchObject({ status: 'applied', placement: { revision: 1, withheld: true } })
    await expect(
      withholdImagePlacementForCopyright({
        placementId,
        expectedRevision: placement.placement_revision,
      }),
    ).resolves.toMatchObject({ status: 'already_applied', placement: { revision: 1 } })
    await expect(
      restoreImagePlacementForCopyright({ placementId, expectedRevision: 0 }),
    ).resolves.toMatchObject({ status: 'stale', placement: { revision: 1, withheld: true } })
    await expect(
      restoreImagePlacementForCopyright({ placementId, expectedRevision: 1 }),
    ).resolves.toMatchObject({ status: 'applied', placement: { revision: 2, withheld: false } })
  })
})
