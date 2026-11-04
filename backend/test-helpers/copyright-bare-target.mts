import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'

/**
 * Adds one hosted use to a notice with only the rows a target needs, for tests of reads and writes
 * that care about the target and not about the post or surface it came from.
 */
export async function insertTestBareCopyrightTarget(
  noticeId: string,
  creatorUserId: string,
  query: TransactionQuery,
): Promise<string> {
  const imageId = uuidv7()
  const placementId = uuidv7()
  await query(sql`/* insertTestBareCopyrightTarget:image */
    INSERT INTO retained_image_identities (id, created_by_id) VALUES (${imageId}, ${creatorUserId})`)
  await query(sql`/* insertTestBareCopyrightTarget:binding */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES (${placementId}, ${imageId}, 'surface')`)
  const { rows } = await query<{ id: string }>(sql`/* insertTestBareCopyrightTarget:target */
    INSERT INTO copyright_notice_targets
      (copyright_notice_id, placement_id, placement_revision, surface_owner_user_id, hosted_use_url)
    VALUES (${noticeId}, ${placementId}, 0, ${creatorUserId}, 'https://example.test/use')
    RETURNING id`)
  return rows[0]!.id
}
