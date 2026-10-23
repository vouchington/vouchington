import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { read } from '@data-stores/psql'

// get how many entities this user bookmarked
export const getUserBookmarkCounts = async (userId: string) => {
  const output: {
    bookmarks: {
      topics: Record<string, number>
      posts: Record<string, number>
      users: Record<string, number>
      rss_feeds: Record<string, number>
    }
    bookmarkers: Record<string, number>
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
    selects.push(`${selectPrefix}        COUNT(*)::INT AS count,
        '${relationData.predicate}' AS bookmark_type,
        '${relationData.object_type}' AS entity_type,
        'bookmarks' AS direction
      FROM ${relationData.table_name}
      WHERE subject_id = $1
        AND deleted_at IS NULL
    `)

    // Bookmarkers: people who bookmarked this user
    if (relationData.object_type === 'user') {
      selects.push(`
        SELECT
          COUNT(*)::INT AS count,
          '${relationData.predicate}' AS bookmark_type,
          NULL AS entity_type,
          'bookmarkers' AS direction
        FROM ${relationData.table_name}
        WHERE object_id = $1
          AND deleted_at IS NULL
      `)
    }
  }

  const { rows } = await read(
    `/* getUserBookmarkCounts */ \n      SELECT\n${selects.join(' UNION ALL ')}`,
    [userId],
  )

  for (const row of rows) {
    if (row.direction === 'bookmarks') {
      const entityType = pluralMap[row.entity_type] || `${row.entity_type}s`
      output.bookmarks[entityType] ||= {}
      output.bookmarks[entityType][row.bookmark_type] = row.count
    } else {
      output.bookmarkers[row.bookmark_type] = row.count
    }
  }

  return output
}
