import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommentTreeOptions } from './types.mts'
import type { CommentSort } from '@voucha/types/entities/comment'
import { clampMaxDepth, detectCommentSort } from '@modules/search-utils'

export default function buildCommentTreeQuery(
  rootId: string,
  options: CommentTreeOptions = {},
): SQLStatement {
  const { max_depth, id_lt, vote_score_lt } = options

  const sort = detectCommentSort(options)
  const safeMaxDepth = clampMaxDepth(max_depth)

  const query = sql`/* buildCommentTreeQuery */`

  query.append(sql`WITH RECURSIVE root_comments AS (`)
  query.append(sql`
    SELECT posts.id, posts.post_type, posts.root_post_id, posts.parent_post_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, posts.community_id
    FROM posts
  `)

  const rootFilters: SQLStatement[] = []
  rootFilters.push(sql`posts.parent_post_id = ${rootId}`)
  rootFilters.push(sql`posts.id > ${rootId}`) // UUIDv7 partition pruning: children always newer than parent
  rootFilters.push(sql`posts.post_type = 'comment'`)

  if (sort === 'new') {
    if (id_lt) {
      rootFilters.push(sql`posts.id < ${id_lt}`)
    }
  } else if (sort === 'best') {
    if (vote_score_lt !== undefined) {
      if (id_lt) {
        rootFilters.push(sql`(posts.votes_score_sort, posts.id) < (${vote_score_lt}, ${id_lt})`)
      } else {
        rootFilters.push(sql`posts.votes_score_sort < ${vote_score_lt}`)
      }
    } else if (id_lt) {
      // Secondary cursor when a score cursor is not provided
      rootFilters.push(sql`posts.id < ${id_lt}`)
    }
  }

  if (rootFilters.length > 0) {
    query.append(sql`WHERE `)
    rootFilters.forEach((filter, index) => {
      if (index > 0) query.append(sql` AND `)
      query.append(filter)
    })
  }

  query.append(rootCommentOrderBy(sort))

  query.append(sql`),
  comment_tree AS (
    SELECT root_comments.id, root_comments.post_type, root_comments.root_post_id, root_comments.parent_post_id, root_comments.deleted_at, root_comments.created_at, root_comments.votes_score_sort, root_comments.community_id, 1 AS depth
    FROM root_comments
    UNION ALL
    SELECT posts.id, posts.post_type, posts.root_post_id, posts.parent_post_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, posts.community_id, comment_tree.depth + 1
    FROM posts
    JOIN comment_tree ON posts.parent_post_id = comment_tree.id
    WHERE comment_tree.depth < ${safeMaxDepth}
      AND posts.id > comment_tree.id -- UUIDv7 partition pruning: replies always newer than parent
      AND posts.post_type = 'comment'
  )
  SELECT
    'post' AS __entity_type,
    comment_tree.id,
    comment_tree.post_type,
    comment_tree.root_post_id,
    comment_tree.parent_post_id,
    comment_tree.deleted_at,
    comment_tree.created_at,
    comment_tree.community_id,
    comment_tree.depth
  `)

  query.append(voteScoreColumn(sort))

  query.append(sql`
  FROM comment_tree
  `)

  query.append(commentTreeOrderBy(sort))

  return query
}

function rootCommentOrderBy(sort: CommentSort): SQLStatement {
  switch (sort) {
    case 'best':
      return sql` ORDER BY posts.votes_score_sort DESC, posts.id DESC`
    case 'new':
      return sql` ORDER BY posts.id DESC`
    default:
      return assertNever(sort, 'Unknown comment sort')
  }
}

function voteScoreColumn(sort: CommentSort): SQLStatement {
  switch (sort) {
    case 'best':
      return sql`,
    comment_tree.votes_score_sort AS vote_score
  `
    case 'new':
      return sql``
    default:
      return assertNever(sort, 'Unknown comment sort')
  }
}

function commentTreeOrderBy(sort: CommentSort): SQLStatement {
  switch (sort) {
    case 'best':
      return sql` ORDER BY comment_tree.votes_score_sort DESC, comment_tree.id DESC`
    case 'new':
      return sql` ORDER BY comment_tree.id DESC`
    default:
      return assertNever(sort, 'Unknown comment sort')
  }
}
