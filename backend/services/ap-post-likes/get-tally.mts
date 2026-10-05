import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export interface ApPostLikesTally {
  activitypub_likes_score: number
  activitypub_likes_count: number
}

// Reads the AP-only like tally for a post, trigger-maintained by fn_project_activitypub_post_likes. Returns
// null when no remote actor has ever liked this post — post_activitypub_like_tallies is lazily created on first Like,
// so a null result means "zero", not an error.
/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/ap-post-likes/README.md`.
 */
export async function getApPostLikesTally(postId: string): Promise<ApPostLikesTally | null> {
  const { rows } = await read<ApPostLikesTally>(sql`/* getApPostLikesTally */
    SELECT activitypub_likes_score, activitypub_likes_count
    FROM post_activitypub_like_tallies
    WHERE post_id = ${postId}
  `)
  return rows[0] ?? null
}
