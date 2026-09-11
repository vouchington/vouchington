import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'

export function committedContributionPostId(response: unknown): string {
  if (response !== null && typeof response === 'object') {
    const candidate = response as { id?: unknown; post?: { id?: unknown } }
    const id = candidate.id ?? candidate.post?.id
    if (typeof id === 'string' && isUUID(id)) return id
  }
  throw new Error('Contribution admission response must include a UUID post id')
}

export async function isContributionAdmissionCommitted(reservationId: string): Promise<boolean> {
  const result = await write<{ committed: boolean }>(sql`/* isContributionAdmissionCommitted */
    SELECT state = 'committed' AS committed
    FROM post_admission_reservations
    WHERE id = ${reservationId}`)
  return result.rows[0]?.committed ?? false
}

export async function getCommittedContributionAdmissionResponse<T>(
  reservationId: string,
): Promise<T> {
  const result = await write<{ response: T }>(sql`/* getCommittedContributionAdmissionResponse */
    SELECT response FROM post_admission_reservations
    WHERE id = ${reservationId} AND state = 'committed'`)
  const response = result.rows[0]?.response
  if (response === undefined)
    throw new Error('Committed contribution admission response was not found')
  return response
}
