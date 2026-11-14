import { getRssSnapshotLegalGeneration } from '@services/entity-cache/rss-snapshot-generation'
import { write } from '@data-stores/psql'
import { createSearchCache } from '@services/entity-cache/search-cache'
import sql from 'sql-template-strings'
import type { Post } from './types.mts'

/** Eligibility and content are read in one database snapshot; hits never recheck publication. */
const getSnapshotsCached = createSearchCache(
  'rss_public_post_snapshots_anon',
  async ({ postIds }: { postIds: string[]; legalGeneration: string }): Promise<Post[]> => {
    if (postIds.length === 0) return []
    // Primary reads prevent a lagging replica from resurrecting content after legal eviction.
    const { rows } = await write<Post>(sql`/* getPublicRssPostSnapshots */
      SELECT snapshot.*
      FROM posts candidate
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = candidate.id
      JOIN view_posts snapshot ON snapshot.id = candidate.id
      WHERE candidate.id = ANY(${postIds}::uuid[])
      ORDER BY array_position(${postIds}::uuid[], candidate.id)
    `)
    return rows
  },
)

export async function getPublicRssPostSnapshotsCached(options: {
  postIds: string[]
}): Promise<Post[]> {
  const legalGeneration = await getRssSnapshotLegalGeneration()
  return getSnapshotsCached({ ...options, legalGeneration })
}
