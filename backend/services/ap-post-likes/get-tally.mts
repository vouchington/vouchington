import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export interface ApPostLikesTally {
  ap_likes_score: number
  ap_likes_count: number
}

// Reads the AP-only like tally for a post, trigger-maintained by fn_sync_ap_post_likes. Returns
// null when no remote actor has ever liked this post — ap_posts is lazily created on first Like,
// so a null result means "zero", not an error.
export async function getApPostLikesTally(postId: string): Promise<ApPostLikesTally | null> {
  const { rows } = await read<ApPostLikesTally>(sql`/* getApPostLikesTally */
    SELECT ap_likes_score, ap_likes_count
    FROM ap_posts
    WHERE post_id = ${postId}
  `)
  return rows[0] ?? null
}
