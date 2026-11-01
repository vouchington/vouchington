import type { TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

/** Own a private object by id before any immutable intake or artifact references it. */
export async function upsertCopyrightStorageObjectId(
  storageKey: string,
  transaction: TransactionQuery,
): Promise<string> {
  const { rows: inserted } = await transaction<{
    id: string
  }>(sql`/* upsertCopyrightStorageObjectId */
    INSERT INTO copyright_notice_storage_objects (storage_key)
    VALUES (${storageKey})
    ON CONFLICT (storage_key) DO NOTHING
    RETURNING id
  `)
  if (inserted[0]) return inserted[0].id

  // A separate statement sees a concurrent winner after its uniqueness conflict commits.
  // The row lock serializes the claim and reference generation with an issued copy.
  const { rows } = await transaction<{
    id: string
    deletion_claimed: boolean
  }>(sql`/* upsertCopyrightStorageObjectId:existing */
    SELECT id, deletion_claimed FROM copyright_notice_storage_objects
    WHERE storage_key = ${storageKey}
    FOR UPDATE
  `)
  if (!rows[0]) throw new Error('Copyright storage object conflict has no owner')
  if (rows[0].deletion_claimed)
    throw createHttpError(409, 'Copyright evidence object deletion has started')
  return rows[0].id
}
