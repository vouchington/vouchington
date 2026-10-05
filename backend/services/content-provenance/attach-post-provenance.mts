import type { StaffContentProvenance } from '@voucha/types/entities/content-provenance'
import { isModerationStaff } from '@services/users/authorization'
import { canViewAnonymousAuthor, maskAnonymousPosts } from '@services/posts/mask-anonymous'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import { getPostProvenanceFacts } from './post-facts.mts'
import {
  buildStaffProvenance,
  resolvePublicProvenanceLabel,
} from './resolve-public-provenance-label.mts'

type ProvenancePost = Pick<Post, 'id' | 'is_anonymous' | 'created_by_id'>

/**
 * Sets `provenance` (API and MCP rows only) and, for moderation staff, `staff_provenance` on
 * copies of the given posts. Run it before `maskAnonymousPosts`, which hides the author id this
 * needs. The cached posts are never mutated.
 *
 * Anonymous posts keep their app (`app: null`) and OAuth client hidden from viewers who cannot see the
 * author, because a named client can identify its owner. They still show the plain channel.
 */
export async function attachPostProvenance<T extends ProvenancePost | null | undefined>(
  posts: T[],
  currentUser?: PrivateUser | null,
): Promise<T[]> {
  const facts = await getPostProvenanceFacts(posts.flatMap(post => (post ? [post.id] : [])))
  const staff = isModerationStaff(currentUser ?? null)

  return posts.map(post => {
    const fact = post ? facts.get(post.id) : undefined
    if (!post || !fact) return post
    const clientVisible = !post.is_anonymous || canViewAnonymousAuthor(post, currentUser)
    const provenance = resolvePublicProvenanceLabel(
      fact.created_via,
      clientVisible ? fact.client : null,
    )
    const staffProvenance: StaffContentProvenance = clientVisible
      ? buildStaffProvenance(fact.created_via, fact.client)
      : { created_via: fact.created_via }
    return {
      ...post,
      ...(provenance && { provenance }),
      ...(staff && { staff_provenance: staffProvenance }),
    }
  })
}

/** Labels posts, then hides anonymous authors. The order matters: see `attachPostProvenance`. */
export async function labelAndMaskPosts<T extends Post>(
  posts: Array<T | null | undefined>,
  currentUser?: PrivateUser | null,
): Promise<Array<T | null | undefined>> {
  return maskAnonymousPosts(await attachPostProvenance(posts, currentUser), currentUser)
}
