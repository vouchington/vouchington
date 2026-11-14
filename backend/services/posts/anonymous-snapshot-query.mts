import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import {
  buildDirectPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { buildLivePostAuthorsClause } from '@modules/feed-query-builders/post-publication-live-author-clause'
import sql from 'sql-template-strings'
import type { Post } from './types.mts'

export type AnonymousSnapshotQueryMode = 'direct' | 'direct-body' | 'discovery'
export type AnonymousPostRows = { post: Post | null; root: Post | null }

/** One bounded, canonical SQL read for all cache misses of one anonymous mode. */
export async function getAnonymousPostRowsByAnyBatch(
  identifiers: string[],
  mode: AnonymousSnapshotQueryMode,
): Promise<Map<string, AnonymousPostRows>> {
  const keys = [...new Set(identifiers)]
  const results = new Map<string, AnonymousPostRows>(
    keys.map(key => [key, { post: null, root: null }]),
  )
  if (keys.length === 0) return results
  const ids = keys.filter(isUUID)
  const slugs = keys.filter(key => !isUUID(key))
  const statement =
    mode === 'direct'
      ? sql`/* getAnonymousDirectPostRowsByAnyBatch */`
      : mode === 'direct-body'
        ? sql`/* getAnonymousPostBodiesByAnyBatch */`
        : sql`/* getAnonymousPostRowsByAnyBatch */`
  statement.append(sql`
    WITH requested AS (
      SELECT input.id, input.id::text AS input_key FROM UNNEST(${ids}::uuid[]) AS input(id)
      UNION ALL
      SELECT slug.post_id AS id, slug.slug AS input_key
      FROM post_slugs slug WHERE slug.slug = ANY(${slugs}::text[])
    ), eligible AS MATERIALIZED (
      SELECT requested.input_key, candidate_post.id AS candidate_id,
        CASE WHEN candidate_post.root_post_id IS NOT NULL THEN access_post.id END AS root_id
      FROM requested
      JOIN posts candidate_post ON candidate_post.id = requested.id
      JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE `)
  if (mode === 'discovery') {
    statement.append(buildPublicPostEligibilityFilter('candidate_post', 'access_post'))
  } else {
    statement.append(sql`(
      (candidate_post.post_type = 'comment' AND `)
    statement.append(
      buildDirectPostEligibilityFilter('access_post', 'access_post', {
        currentUserId: null,
        isModerationStaff: false,
      }),
    )
    statement.append(sql` AND `)
    statement.append(buildLivePostAuthorsClause('candidate_post', 'access_post'))
    statement.append(sql`) OR (candidate_post.post_type <> 'comment' AND `)
    statement.append(
      buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
        currentUserId: null,
        isModerationStaff: false,
      }),
    )
    statement.append(sql`))`)
  }
  statement.append(sql`
    ), projection_ids AS MATERIALIZED (
      SELECT candidate_id AS id FROM eligible
      UNION SELECT root_id AS id FROM eligible WHERE root_id IS NOT NULL
    ), projected AS MATERIALIZED (
      SELECT view_posts.id, row_to_json(view_posts) AS post_json
      FROM projection_ids JOIN view_posts ON view_posts.id = projection_ids.id
    )
    SELECT eligible.input_key,
      candidate_view.post_json AS candidate_json,
      root_view.post_json AS root_json,
      candidate_post.id AS stub_id,
      candidate_post.post_type AS stub_post_type,
      candidate_post.parent_post_id AS stub_parent_post_id,
      candidate_post.root_post_id AS stub_root_post_id,
      candidate_post.created_at AS stub_created_at,
      candidate_post.updated_at AS stub_updated_at,
      candidate_post.deleted_at AS stub_deleted_at,
      candidate_post.approved_at AS stub_approved_at,
      candidate_post.broadcast AS stub_broadcast,
      candidate_post.privacy AS stub_privacy,
      candidate_post.community_id AS stub_community_id,
      candidate_post.created_by_id AS stub_created_by_id
    FROM eligible
    JOIN posts candidate_post ON candidate_post.id = eligible.candidate_id
    LEFT JOIN projected candidate_view ON candidate_view.id = candidate_post.id
    LEFT JOIN projected root_view ON root_view.id = eligible.root_id
  `)
  const { rows } = await read<SnapshotRow>(statement)
  for (const row of rows) {
    const post =
      row.candidate_json ?? (row.stub_post_type === 'comment' ? makeCommentStub(row) : null)
    results.set(row.input_key, {
      post,
      root: post?.root_post_id ? row.root_json : null,
    })
  }
  return results
}

type SnapshotRow = {
  input_key: string
  candidate_json: Post | null
  root_json: Post | null
  stub_id: string
  stub_post_type: Post['post_type']
  stub_parent_post_id: string | null
  stub_root_post_id: string | null
  stub_created_at: Date
  stub_updated_at: Date
  stub_deleted_at: Date | null
  stub_approved_at: Date | null
  stub_broadcast: Post['broadcast']
  stub_privacy: Post['privacy']
  stub_community_id: string | null
  stub_created_by_id: string | null
}

function makeCommentStub(row: SnapshotRow): Post {
  return {
    __entity_type: 'post',
    id: row.stub_id,
    slug: null,
    post_type: 'comment',
    title: '',
    markdown: '',
    ai_summary_markdown: '',
    parent_post_id: row.stub_parent_post_id,
    root_post_id: row.stub_root_post_id,
    created_by_id: row.stub_created_by_id,
    created_by: null,
    updated_by: null,
    created_at: row.stub_created_at,
    updated_at: row.stub_updated_at,
    updated_by_id: null,
    deleted_at: row.stub_deleted_at,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    approved_at: row.stub_approved_at,
    rejected_at: null,
    in_review_at: null,
    locked_at: null,
    locked_by_id: null,
    broadcast: row.stub_broadcast,
    privacy: row.stub_privacy,
    is_anonymous: false,
    community_id: row.stub_community_id,
    clearance_status: 'pending',
    clearance_reason: null,
    clearance_updated_at: null,
  } as Post
}
