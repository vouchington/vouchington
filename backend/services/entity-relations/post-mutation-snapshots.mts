import sql from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'

export type PostMutationAccessSnapshot = {
  id: string
  root_post_id: string
  candidate_created_by_id: string | null
  root_created_by_id: string | null
  root_privacy: 'public' | 'private'
}

/** The private-root rows a delegated credential may not name. Same rule as `assertPostMutationAccess`. */
export function isDelegatedPrivateRootDenied(
  authority: { readonly grantedScopes: readonly string[]; readonly credentialOwnerId: string },
  post: PostMutationAccessSnapshot,
): boolean {
  if (post.root_privacy !== 'private') return false
  return (
    !authority.grantedScopes.includes('post-relations.owned-private:write') ||
    post.candidate_created_by_id !== authority.credentialOwnerId ||
    post.root_created_by_id !== authority.credentialOwnerId
  )
}

export async function readPostMutationAccessSnapshots(
  postIds: readonly string[],
  options?: QueryOptions,
): Promise<PostMutationAccessSnapshot[]> {
  const { rows } = await write<PostMutationAccessSnapshot>(
    sql`/* assertPostMutationAccess */
      SELECT
        candidate_post.id,
        access_post.id AS root_post_id,
        candidate_post.created_by_id AS candidate_created_by_id,
        access_post.created_by_id AS root_created_by_id,
        access_post.privacy AS root_privacy
      FROM posts candidate_post
      JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE candidate_post.id = ANY(${postIds}::uuid[])
    `,
    options,
  )
  return rows
}
