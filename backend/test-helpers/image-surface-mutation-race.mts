import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function retireTestTopicSurfaces(
  topicId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* retireTestTopicSurfaces */
    UPDATE topics SET logo_image_id = NULL, hero_image_id = NULL WHERE id = ${topicId}`)
}
