import { write } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'

export type LivePublicationPost = {
  id: string
  parent_post_id: string | null
  root_post_id: string | null
  created_by_id: string | null
  community_id: string | null
  post_type: string
  sitemap_day: string
  is_public: boolean
  eligibility_fingerprint: string
}

/** Loads only the captured post IDs that still exist when a direct publication job runs. */
export async function listLivePublicationPosts(
  postIds: readonly string[],
): Promise<LivePublicationPost[]> {
  const ids = [...new Set(postIds)]
  if (ids.length === 0) return []
  // A post-scoped job may add its own ID beside a full captured-key page.
  if (ids.length > getPostPublicationWorkLimit('capture_batch_size') + 1)
    throw new RangeError('Publication post job exceeds its configured page limit')

  const statement = sql`/* listLivePublicationPosts */
    SELECT candidate.id, candidate.parent_post_id, candidate.root_post_id,
      candidate.created_by_id, candidate.community_id, candidate.post_type,
      to_char(candidate.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS sitemap_day, `
  statement
    .append(publicationEligibilityFingerprintSql())
    .append(sql` AS eligibility_fingerprint, (`)
  statement.append(buildPublicPostEligibilityFilter('candidate', 'root')).append(sql`) AS is_public
    FROM UNNEST(${ids}::uuid[]) AS input(post_id)
    JOIN posts candidate ON candidate.id = input.post_id
    JOIN posts root ON root.id = COALESCE(candidate.root_post_id, candidate.id)
    ORDER BY candidate.id`)
  const { rows } = await write<LivePublicationPost>(statement)
  return rows
}
