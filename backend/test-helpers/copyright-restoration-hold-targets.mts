import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'

export type SharedPlacement = {
  claimant: Awaited<ReturnType<typeof createTestUserDirect>>
  placementId: string
  imageId: string
}

export async function currentSharedTarget(shared: SharedPlacement) {
  const { rows } = await read<{ revision: number }>(
    sql`/* currentSharedTarget */ SELECT revision FROM media_placements WHERE id = ${shared.placementId}`,
  )
  return {
    placementId: shared.placementId,
    placementRevision: rows[0]!.revision,
    imageId: shared.imageId,
    bindingFamily: 'post' as const,
    hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
  }
}

export async function createFixtureTargets(claimantId: string, targetCount: number) {
  const [imageIds, postId] = await Promise.all([
    Promise.all(Array.from({ length: targetCount }, () => insertTestImage(claimantId))),
    insertTestPost({
      title: `copyright hold ${crypto.randomUUID()}`,
      slug: `copyright-hold-${crypto.randomUUID()}`,
      createdById: claimantId,
      markdown: 'images',
    }),
  ])
  return Promise.all(
    imageIds.map(async (imageId, orderIndex) => {
      await insertTestPostImage({ postId, imageId, orderIndex })
      const placement = await getTestPostImagePlacement(postId, imageId)
      if (!placement) throw new Error('fixture image placement disappeared')
      return {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post' as const,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      }
    }),
  )
}
