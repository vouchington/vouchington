import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'

export function assertCanCreateAdminOnlyPostType(
  creator: Pick<PrivateUser, 'roles'>,
  postType: NonNullable<CreatePostInput['post_type']>,
): void {
  if (postType !== 'article' && postType !== 'blog_post') return
  assert(
    creator.roles.includes('administrator'),
    403,
    'Only administrators can create articles or blog posts',
  )
}
