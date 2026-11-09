import { read } from '@data-stores/psql'
import {
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  getTestPostImagePlacement,
} from './index.mts'

export async function createTestDeferredCapacityPolicyFixture() {
  const user = await createTestUserDirect()
  const imageId = await insertTestImage(user.id)
  const postId = await insertTestPost({
    title: 'Deferred EXPLAIN policy',
    slug: crypto.randomUUID(),
    createdById: user.id,
    markdown: '',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('Missing deferred EXPLAIN placement')
  return {
    text: `/* explainDeferredPolicy */ UPDATE image_placement_capacity_reservations
      SET is_current_image_delivery_eligible = false WHERE placement_id = $1::uuid
      RETURNING placement_id`,
    values: [placement.placement_id],
    async readPolicy() {
      const { rows } = await read<{ is_current_image_delivery_eligible: boolean }>(
        `/* readExplainDeferredPolicy */ SELECT is_current_image_delivery_eligible
          FROM image_placement_capacity_reservations WHERE placement_id = $1::uuid`,
        [placement.placement_id],
      )
      return rows[0]!.is_current_image_delivery_eligible
    },
  }
}
