import { write } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'
import { readRawPublicationCandidatePage } from './raw-candidate-page.mts'

export type ReconciliationPost = {
  id: string
  parent_post_id: string | null
  root_post_id: string | null
  created_by_id: string | null
  community_id: string | null
  post_type: string
  sitemap_day: string
  is_public: boolean
  eligibility_fingerprint: string
  identity_snapshot_id?: string
}

export async function listPublicationCandidatePage(
  work: ClaimedPostPublicationDirtyWork,
  limit: number,
  selectedPostIds?: readonly string[],
): Promise<{
  posts: ReconciliationPost[]
  cursorPostId: string | null
  hasMore: boolean
  pendingPostId: string | null
  pendingAncestorId: string | null
}> {
  if (!selectedPostIds) {
    const raw = await readRawPublicationCandidatePage(work, limit)
    return {
      posts: await listPublicationCandidates(work, limit, raw.postIds),
      cursorPostId: raw.cursorPostId,
      hasMore: raw.hasMore,
      pendingPostId: raw.pendingPostId,
      pendingAncestorId: raw.pendingAncestorId,
    }
  }
  const posts = await listPublicationCandidates(work, limit, selectedPostIds)
  return {
    posts,
    cursorPostId: selectedPostIds?.at(-1) ?? posts.at(-1)?.id ?? work.cursor_post_id,
    hasMore: (selectedPostIds ?? posts).length === limit,
    pendingPostId: null,
    pendingAncestorId: null,
  }
}

export async function listPublicationCandidates(
  _work: ClaimedPostPublicationDirtyWork,
  limit: number,
  selectedPostIds: readonly string[],
): Promise<ReconciliationPost[]> {
  const query = sql`/* listPublicationCandidates */
    WITH scoped_posts AS (SELECT UNNEST(${selectedPostIds}::uuid[]) AS id)
    SELECT candidate.id, candidate.parent_post_id, candidate.root_post_id,
      candidate.created_by_id,
      candidate.community_id, candidate.post_type,
      to_char(candidate.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS sitemap_day, `
  query.append(publicationEligibilityFingerprintSql()).append(sql` AS eligibility_fingerprint, `)
  query.append(sql` (`)
  query.append(buildPublicPostEligibilityFilter('candidate', 'root')).append(sql`) AS is_public
    FROM scoped_posts scoped
    JOIN posts candidate ON candidate.id = scoped.id
    JOIN posts root ON root.id = COALESCE(candidate.root_post_id, candidate.id)`)
  query.append(sql` ORDER BY candidate.id LIMIT ${limit}`)
  const { rows } = await write<ReconciliationPost>(query)
  return rows
}
