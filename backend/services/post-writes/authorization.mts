import type { CreatePostInput } from '@services/posts'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import { currentUserCanCreateStoryPost } from '@services/stories/authorization'
import type { PrivateUser } from '@services/users/types'

/** Source story discussions retain their authenticated-user policy; authored posts require identity. */
export function currentUserCanCreatePostWrite(user: PrivateUser, body: CreatePostInput): boolean {
  return body.post_type === 'story' &&
    body.story_id !== undefined &&
    body.community_id === undefined
    ? currentUserCanCreateStoryPost(user)
    : currentUserCanCreatePost(user)
}
