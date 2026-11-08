import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestPostClearanceAuthor(changeId: string): Promise<string | null> {
  const { rows } = await read<{ post_author_user_id: string | null }>(sql`
    /* readTestPostClearanceAuthor */
    SELECT post_author_user_id FROM post_clearance_changes WHERE id = ${changeId}::uuid
  `)
  if (!rows[0]) throw new Error('Expected a post clearance change')
  return rows[0].post_author_user_id
}

/** Mutates an audit row only for trigger-maintenance regression coverage. */

export async function getPostClearanceStatus(postId: string): Promise<string | null> {
  const { rows } = await read<{ clearance_status: string }>(
    sql`/* getPostClearanceStatus */
    SELECT clearance_status FROM view_post_clearance_status WHERE post_id = ${postId}
  `,
  )
  return rows[0]?.clearance_status ?? null
}

export async function getPostClearanceChanges(
  postId: string,
): Promise<Array<{ change_type: string; changed_by_id: string | null }>> {
  const { rows } = await read<{ change_type: string; changed_by_id: string | null }>(
    sql`/* getPostClearanceChanges */
    SELECT change_type, changed_by_id
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id
  `,
  )
  return rows
}

export async function getLatestPostClearanceMetadata(
  postId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await read<{ metadata: Record<string, unknown> }>(
    sql`/* getLatestPostClearanceMetadata */
    SELECT metadata
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0]?.metadata ?? {}
}

export async function getLatestPostClearanceDecision(postId: string): Promise<{
  id: string
  changed_by_id: string | null
  public_reason_code: string | null
  private_note: string | null
  is_platform_override: boolean
} | null> {
  const { rows } = await read<{
    id: string
    changed_by_id: string | null
    public_reason_code: string | null
    private_note: string | null
    is_platform_override: boolean
  }>(
    sql`/* getLatestPostClearanceDecision */
    SELECT id, changed_by_id, public_reason_code, private_note, is_platform_override
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0] ?? null
}

export async function getLatestPostClearanceTransparencyCategories(
  postId: string,
): Promise<string[]> {
  const { rows } = await read<{ moderation_transparency_categories: string[] }>(
    sql`/* getLatestPostClearanceTransparencyCategories */
    SELECT moderation_transparency_categories::text[] AS moderation_transparency_categories
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0]?.moderation_transparency_categories ?? []
}

/** `undefined` means no clearance change row exists yet; `null` means the latest row stamped a global (non-community) cohort. */
export async function getLatestPostClearanceTransparencyCommunityId(
  postId: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ moderation_transparency_community_id: string | null }>(sql`
    /* getLatestPostClearanceTransparencyCommunityId */
    SELECT moderation_transparency_community_id
    FROM post_clearance_changes
    WHERE post_id = ${postId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.moderation_transparency_community_id
}

export async function getTestCurrentPostClearance(postId: string): Promise<{
  clearance_version: string
  clearance_changed_at: Date | null
  clearance_changed_by_id: string | null
  clearance_public_reason_code: string | null
  clearance_is_platform_override: boolean
  has_creation_moderation_bypass: boolean
  clearance_status: string
  clearance_reason: string | null
} | null> {
  const { rows } = await read<{
    clearance_version: string
    clearance_changed_at: Date | null
    clearance_changed_by_id: string | null
    clearance_public_reason_code: string | null
    clearance_is_platform_override: boolean
    has_creation_moderation_bypass: boolean
    clearance_status: string
    clearance_reason: string | null
  }>(sql`/* getTestCurrentPostClearance */
    SELECT post.clearance_version, post.clearance_changed_at,
      post.clearance_changed_by_id, post.clearance_public_reason_code,
      post.clearance_is_platform_override, post.has_creation_moderation_bypass,
      status.clearance_status, status.clearance_reason
    FROM posts post
    JOIN view_post_clearance_status status ON status.post_id = post.id
    WHERE post.id = ${postId}
  `)
  return rows[0] ?? null
}
