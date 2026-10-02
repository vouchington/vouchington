import type { PostBroadcast, PostPrivacy, PostType } from '@voucha/types/entities/post'

import type { ContentCreationChannel } from '@voucha/types/entities/content-provenance'

// `INSERT INTO posts ... RETURNING *` reads table `posts`, not `view_posts`.
// Column nullability follows backend/data-stores/psql/schema-snapshot/markdown/tables/posts.md.
// node-pg parses timestamptz as Date, bytea as Buffer, xid8/tsvector as text, and vector as number[].
export type PostsTableRow = {
  id: string
  created_via: ContentCreationChannel
  created_via_oauth_client_id: string | null
  post_type: PostType
  title: string
  markdown: string
  ai_summary_markdown: string
  parent_id: string | null
  root_id: string | null
  broadcast: PostBroadcast
  privacy: PostPrivacy
  is_anonymous: boolean
  community_id: string | null
  votes_snapshot_xmax: string | null
  votes_snapshot_xip_count: number | null
  votes_score_up: number
  votes_score_none: number
  votes_score_down: number
  votes_count_up: number
  votes_count_none: number
  votes_count_down: number
  votes_score_sort: number | null
  votes_score_net: number | null
  latest_clearance_change_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  created_by_id: string | null
  created_at: Date | null
  updated_at: Date
  updated_by_id: string | null
  deleted_at: Date | null
  deleted_by_id: string | null
  archived_at: Date | null
  archived_by_id: string | null
  data_point_vertical: string | null
  structured_data: unknown
  url_id: string | null
  creation_source_url_id: string | null
  declared_language: string | null
  lingua_rs_detected_language: string | null
  lingua_rs_content_sha256: Buffer | null
  lingua_rs_input_sha256: Buffer | null
  lingua_rs_results: unknown
  lingua_rs_detected_at: Date | null
  bedrock_nova_multimodal_v1_content_sha256: Buffer
  bedrock_nova_multimodal_v1_input_sha256: Buffer | null
  bedrock_nova_multimodal_v1_embedding: number[] | null
  bedrock_nova_multimodal_v1_embedding_created_at: Date | null
  bedrock_nova_multimodal_v1_input_token_count: number | null
  ban_evasion_post_embedding_input_sha256: Buffer | null
  llm_moderation_content_sha256: Buffer
  search_vector: string | null
}
