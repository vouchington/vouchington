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
