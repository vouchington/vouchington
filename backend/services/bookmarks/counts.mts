import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { read } from '@data-stores/psql'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
  type CappedCount,
} from '@services/users/profile-count-cap'

// get how many entities this user bookmarked
// Each count reads at most the cap plus one row, so a user's relation total never sets the cost.
export const getUserBookmarkCounts = async (userId: string) => {
  const cap = getProfileCountCap()
  const output: {
    bookmarks: {
      topics: Record<string, CappedCount>
      posts: Record<string, CappedCount>
      users: Record<string, CappedCount>
      rss_feeds: Record<string, CappedCount>
    }
    bookmarkers: Record<string, CappedCount>
  } = {
    bookmarks: {
      topics: {},
      posts: {},
      users: {},
      rss_feeds: {},
    },
    bookmarkers: {},
  }

  const pluralMap: Record<string, 'topics' | 'posts' | 'users' | 'rss_feeds'> = {
    topic: 'topics',
    post: 'posts',
    user: 'users',
    rss_feed: 'rss_feeds',
  }

  const selects: string[] = []
  const userRelations = entityRelationMetadatum.filter(
    r => r.subject_type === 'user' && r.is_bookmark,
  )

  for (const relationData of userRelations) {
    // Bookmarks: things this user bookmarked
    const selectPrefix = selects.length === 0 ? '' : '\n      SELECT\n'
    selects.push(`${selectPrefix}        (SELECT COUNT(*)::INT FROM (
          SELECT 1 FROM ${relationData.table_name}
          WHERE subject_id = $1
            AND deleted_at IS NULL
          LIMIT $2
        ) probe) AS count,
        '${relationData.predicate}' AS bookmark_type,
        '${relationData.object_type}' AS entity_type,
        'bookmarks' AS direction
    `)

    // Bookmarkers: people who bookmarked this user
    if (relationData.object_type === 'user') {
      selects.push(`
        SELECT
          (SELECT COUNT(*)::INT FROM (
            SELECT 1 FROM ${relationData.table_name}
            WHERE object_id = $1
              AND deleted_at IS NULL
            LIMIT $2
          ) probe) AS count,
          '${relationData.predicate}' AS bookmark_type,
          NULL AS entity_type,
          'bookmarkers' AS direction
      `)
    }
  }

  const { rows } = await read<
    | { direction: 'bookmarks'; entity_type: string; bookmark_type: string; count: number }
    | { direction: 'bookmarkers'; entity_type: null; bookmark_type: string; count: number }
  >(`/* getUserBookmarkCounts */ \n      SELECT\n${selects.join(' UNION ALL ')}`, [
    userId,
    profileCountProbeLimit(cap),
  ])

  for (const row of rows) {
    if (row.direction === 'bookmarks') {
      const entityType = pluralMap[row.entity_type] || `${row.entity_type}s`
      output.bookmarks[entityType] ||= {}
      output.bookmarks[entityType][row.bookmark_type] = toCappedCount(row.count, cap)
    } else {
      output.bookmarkers[row.bookmark_type] = toCappedCount(row.count, cap)
    }
  }

  return output
}
