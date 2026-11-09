import { beginTransaction } from '@data-stores/psql'
import { writeImageDeliveryPolicyMutation } from '../../services/media-delivery-safety/image-policy-mutation.mts'
import sql from 'sql-template-strings'

export async function markImageQuarantinePending(imageId: string): Promise<void> {
  await using query = await beginTransaction()
  await writeImageDeliveryPolicyMutation(query, imageId, scope =>
    scope(
      sql`/* markImageQuarantinePending */
    UPDATE images
    SET quarantine_pending_at = NOW()
    WHERE id = ${imageId}
  `,
    ),
  )
  await query.commit()
}
