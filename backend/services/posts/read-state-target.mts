import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { canViewPost } from './check-privacy-access.mts'
import { getPostByAny } from './get.mts'

/** A post whose read state the caller may change: it exists and the caller can see it. */
export async function assertPostReadStateTarget(user: PrivateUser, id: string): Promise<void> {
  const post = await getPostByAny(id)
  assert(post && !post.deleted_at, 404, 'Post not found')
  assert(await canViewPost(user, post), 404, 'Post not found')
}
