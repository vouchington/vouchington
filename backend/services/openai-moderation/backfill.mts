import { getOpenaiModerationWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'

export type BackfillIdPage = { ids: string[]; hasMore: boolean }

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

/**
 * One page of post IDs after `afterId` that are missing OpenAI omni moderation results, in id
 * order. `hasMore` is true when the page is full, so the caller continues from its last id.
 *
 * Used by the backfill dispatcher to re-enqueue moderation for posts that were never
 * processed or whose jobs were lost (e.g. after a Valkey wipe).
 *
 * A post needs (re-)moderation whenever the fingerprint that was actually moderated
 * (`input_sha256`) differs from the current content fingerprint (`content_sha256`):
 * `input_sha256 IS DISTINCT FROM content_sha256`. Because `content_sha256` is NOT NULL,
 * this is equivalent to (and uses) the existing
 * `ids_posts__openai_omni_moderation_to_update` partial index predicate
 * (`input_sha256 IS NULL OR input_sha256 != content_sha256`). It correctly covers:
 *
 * - Never moderated (input NULL, content set) → included.
 * - Content changed after a prior moderation (input != content) → included.
 * - No-content-marked then edited to add content (`markPostOpenAIModerationNoContent`
 *   left input NULL while the edit updated content_sha256) → included. A `created_at`-based
 *   predicate would miss this case.
 * - Up to date (input == content) → excluded.
 *
 * No-content-complete posts (input NULL, content = empty fingerprint) are also matched,
 * but re-enqueuing them is idempotent and makes no OpenAI call (the worker re-marks them
 * no-content), and a backfill is a rare recovery operation — so over-inclusion is harmless.
 */
export async function listUnmoderatedPostIdPage(afterId?: string): Promise<BackfillIdPage> {
  const limit = getOpenaiModerationWorkLimit('backfill_batch_size')
  const { rows } = await read<{ id: string }>(
    sql`/* listUnmoderatedPostIdPage */
      SELECT post.id
      FROM posts post
      LEFT JOIN post_moderation_versions version
        ON version.post_id = post.id
       AND version.content_sha256 = post.llm_moderation_content_sha256
       AND version.policy_revision = ${POST_MODERATION_POLICY_REVISION}
      WHERE post.deleted_at IS NULL
        AND post.id > ${afterId ?? START_OF_IDS}::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM post_moderation_dispositions disposition
          WHERE disposition.version_id = version.id
            AND disposition.source = 'openai_omni'
            AND disposition.disposition <> 'incomplete'
        )
      ORDER BY post.id
      LIMIT ${limit}
    `,
  )
  return toPage(rows, limit)
}

/**
 * One page of image IDs after `afterId` that are missing OpenAI omni moderation results.
 *
 * Only includes images with completed uploads — pending or failed uploads do not have
 * a usable S3 object for the moderation API to inspect.
 */
export async function listUnmoderatedImageIdPage(afterId?: string): Promise<BackfillIdPage> {
  const limit = getOpenaiModerationWorkLimit('backfill_batch_size')
  const { rows } = await read<{ id: string }>(
    sql`/* listUnmoderatedImageIdPage */
      SELECT id FROM images
      WHERE openai_omni_moderation_created_at IS NULL
        AND deleted_at IS NULL
        AND upload_completed_at IS NOT NULL
        AND id > ${afterId ?? START_OF_IDS}::uuid
      ORDER BY id
      LIMIT ${limit}
    `,
  )
  return toPage(rows, limit)
}

function toPage(rows: { id: string }[], limit: number): BackfillIdPage {
  return { ids: rows.map(row => row.id), hasMore: rows.length === limit }
}
