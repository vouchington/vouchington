import type { QueryExecutor } from '@data-stores/psql/types'
import { canViewPostsBatch } from '@services/posts'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import type { CopyrightImageSelector } from './placement-resolution.mts'

/** Checks all post visibility with one batch call and all community visibility with one read. */
export async function claimantCanViewCopyrightImagePlacements(
  inputs: CopyrightImageSelector[],
  currentUser: PrivateUser | null,
  query: QueryExecutor,
): Promise<boolean[]> {
  const posts = inputs.filter(input => input.surfaceKind === 'post-image')
  const postVisibility = await canViewPostsBatch(
    currentUser,
    posts.map(post => ({ id: post.postId })),
    { query },
  )
  const communityIds = inputs.flatMap(input => ('communityId' in input ? [input.communityId] : []))
  const communityVisibility = new Map<string, boolean>()
  if (communityIds.length > 0) {
    const { rows } = await query<{
      id: string
      visibility: 'public' | 'private'
      member_id: string | null
    }>(sql`/* claimantCanViewCopyrightImagePlacements:communities */
      SELECT community.id, community.visibility, member.id AS member_id
      FROM communities community
      LEFT JOIN community_members member ON member.community_id = community.id
        AND member.user_id = ${currentUser?.id ?? null}::uuid AND member.removed_at IS NULL
      WHERE community.id = ANY(${communityIds}::uuid[]) AND community.deleted_at IS NULL
    `)
    for (const row of rows) {
      communityVisibility.set(
        row.id,
        row.visibility === 'public' ||
          Boolean(currentUser && (currentUser.roles.includes('administrator') || row.member_id)),
      )
    }
  }
  return inputs.map(input => {
    if (input.surfaceKind === 'post-image') return postVisibility.get(input.postId) ?? false
    if ('communityId' in input) return communityVisibility.get(input.communityId) ?? false
    return true
  })
}
