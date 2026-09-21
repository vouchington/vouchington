import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'
import { currentUserCanUpdatePost } from './authorization.mts'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import { validatePostImageInputs } from './image-input-validation.mts'
import type { PostImageInput } from './images.mts'
import assert from 'http-assert'

export async function assertPostImagesCanBeUpdated(
  currentUser: PrivateUser,
  post: Post,
  images: PostImageInput[],
): Promise<void> {
  assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')
  await validatePostImageInputs(images, currentUser.id, currentUser.roles.includes('administrator'))
  if (post.community_id) {
    await assertCommunityNoLinksAllowed({
      communityId: post.community_id,
      currentUser,
      updates: { images },
    })
  }
}
