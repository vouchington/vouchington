import type { QueryOptions } from '@data-stores/psql/types'
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
  options: QueryOptions = {},
): Promise<T[]> {
  const facts = await getPostProvenanceFacts(
    posts.flatMap(post => (post ? [post.id] : [])),
    options,
  )
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

/**
 * Labels the post a write route or tool returns right after it wrote it, with the same rules as a
 * read for `viewer`. It reads the primary, because the row was committed an instant ago and a
 * replica may not have it yet. Run it on the response only, never on a post that is stored: an
 * idempotent replay replays the stored post, and a rename or verification change must still show
 * on the next response.
 */
export async function attachWrittenPostProvenance<T extends ProvenancePost>(
  post: T,
  viewer: PrivateUser | null,
): Promise<T> {
  return (await attachPostProvenance([post], viewer, { readOnly: false }))[0] ?? post
}

/** Labels posts, then hides anonymous authors. The order matters: see `attachPostProvenance`. */
export async function labelAndMaskPosts<T extends Post>(
  posts: Array<T | null | undefined>,
  currentUser?: PrivateUser | null,
): Promise<Array<T | null | undefined>> {
  return maskAnonymousPosts(await attachPostProvenance(posts, currentUser), currentUser)
}
