import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type CategoryVoteState = 'finalized' | 'unfinalized'

export async function assertCommunityPostTopicsNotMuted(
  postId: string,
  communityId: string,
  options: QueryOptions,
  categoryVoteState: CategoryVoteState,
): Promise<void> {
  const mutedTopicsTable = getEntityRelationTableNameOrThrow({
    subjectType: 'community',
    objectType: 'topic',
    predicate: 'mute',
  })
  const mutedPostsQuery = sql`/* assertCommunityPostTopicsNotMuted */
    SELECT DISTINCT mt.subject_id AS community_id
    FROM relation__post__category__topic pc
    JOIN `
  mutedPostsQuery.append(`${mutedTopicsTable} mt`)
  mutedPostsQuery.append(sql`
      ON mt.object_id = pc.object_id
      AND mt.deleted_at IS NULL
    WHERE pc.subject_id = ${postId}
      AND pc.deleted_at IS NULL
      AND (
        (${categoryVoteState === 'finalized'} AND pc.votes_score_net > 0)
        OR (${categoryVoteState === 'unfinalized'} AND EXISTS (
          SELECT 1 FROM post_explicit_topic_categories explicit
          WHERE explicit.post_id = pc.subject_id AND explicit.topic_id = pc.object_id
        ))
      )
      AND mt.subject_id = ${communityId}
    UNION
    SELECT DISTINCT mt.subject_id AS community_id
    FROM relation__post__category__topic_alias pca
    JOIN topic_aliases alias ON alias.id = pca.object_id
    JOIN `)
  mutedPostsQuery.append(`${mutedTopicsTable} mt`)
  mutedPostsQuery.append(sql`
      ON mt.object_id = alias.topic_id
      AND mt.deleted_at IS NULL
    WHERE pca.subject_id = ${postId}
      AND pca.deleted_at IS NULL
      AND (
        (${categoryVoteState === 'finalized'} AND pca.votes_score_net > 0)
        -- Unfinalized: no vote score yet to test, so this checks authorship (a source row
        -- exists) rather than membership (relation.votes_score_net > 0, used above) — the
        -- one legitimate use of post_topic_alias_sources as a muted-topic gate.
        OR (${categoryVoteState === 'unfinalized'} AND EXISTS (
          SELECT 1 FROM post_topic_alias_sources source
          WHERE source.post_id = pca.subject_id AND source.topic_alias_id = pca.object_id
        ))
      )
      AND mt.subject_id = ${communityId}
    `)
  const { rows } = await read(mutedPostsQuery, options)
  assert(
    !rows.some(row => row.community_id === communityId),
    422,
    'Post topics are muted in this community',
  )
}
