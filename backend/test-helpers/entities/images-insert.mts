import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestImage(userId: string): Promise<string> {
  const sha256 = randomBytes(32)
  const s3Key = `test/${randomBytes(16).toString('hex')}`
  const { rows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO images (
      created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_results, is_flagged_by_openai_omni_moderation, openai_omni_moderation_created_at
    )
    VALUES (${userId}, ${sha256}, NOW(), NOW(), '{}', ${s3Key}, '[]'::jsonb, false, NOW())
    RETURNING id
  `),
  )
  return rows[0].id
}

export async function insertTestImageWithSha256(
  userId: string,
): Promise<{ id: string; sha256: Buffer }> {
  const sha256 = randomBytes(32)
  const s3Key = `test/${randomBytes(16).toString('hex')}`
  const { rows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO images (
      created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_results, is_flagged_by_openai_omni_moderation, openai_omni_moderation_created_at
    )
    VALUES (${userId}, ${sha256}, NOW(), NOW(), '{}', ${s3Key}, '[]'::jsonb, false, NOW())
    RETURNING id
  `),
  )
  return { id: rows[0].id, sha256 }
}

/** An explicit owned UUID lets native cursor fixtures reserve a closed adjacent key interval. */
export async function insertTestStagedImage(
  userId: string,
  options: { id: string; stagedAt: Date },
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    allowUnannotatedQuery(sql`
    INSERT INTO images (id, created_by_id, sha_256, data, s3_key, upload_staged_at)
    VALUES (${options.id}, ${userId}, NULL, '{}', ${options.id}, ${options.stagedAt})
    RETURNING id
  `),
  )
  if (!rows[0]) throw new Error('Staged image fixture was not inserted')
  return rows[0].id
}
