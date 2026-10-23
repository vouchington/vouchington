import { write } from '@data-stores/psql'
import { mintUUIDv7 } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { onTestFinished } from 'vitest'

/** Adjacent physical keys keep the owned interval free of unrelated dirty-test rows. */
export async function createOwnedStagedSweepInterval(userId: string) {
  const prefix = mintUUIDv7().slice(0, -4)
  const [anchor, first, last] = ['0000', '0001', '0002'].map(suffix => `${prefix}${suffix}`)
  const ownedIds = [anchor!, first!, last!]
  onTestFinished(async () => {
    await write(sql`/* createOwnedStagedSweepInterval:cleanup */
      DELETE FROM images
      WHERE id = ANY(${ownedIds}::uuid[]) AND created_by_id = ${userId}::uuid`)
  })
  const stagedAt = new Date(Date.now() - 2 * 60 * 60 * 1000)
  for (const [id, deleted] of [
    [anchor, true],
    [first, false],
    [last, false],
  ] as const)
    await write(sql`/* createOwnedStagedSweepInterval */
      INSERT INTO images (
        id, created_by_id, data, s3_key, upload_staged_at, upload_started_at,
        upload_failed_at, upload_error, upload_source_deleted_at
      ) VALUES (
        ${id}::uuid, ${userId}::uuid, '{}'::jsonb, ${id}, ${stagedAt}, ${stagedAt},
        ${stagedAt}, 'owned failed upload', ${deleted ? stagedAt : null}
      )`)
  return { anchor: anchor!, first: first!, last: last!, stagedAt }
}
