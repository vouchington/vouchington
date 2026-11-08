import type { PostImageRollback } from './images-rollback-types.mts'

export function postImagesEqual(
  actual: PostImageRollback['currentImages'],
  expected: PostImageRollback['currentImages'],
): boolean {
  if (actual.length !== expected.length) return false
  for (let index = 0; index < actual.length; index++) {
    const image = actual[index]!
    const expectedImage = expected[index]!
    if (
      image.image_id !== expectedImage.image_id ||
      image.order_index !== expectedImage.order_index ||
      image.caption !== expectedImage.caption
    ) {
      return false
    }
  }
  return true
}
