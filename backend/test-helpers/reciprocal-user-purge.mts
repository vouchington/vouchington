import { write } from '@data-stores/psql'

export async function setReciprocalTestUserDeletionActors(
  firstUserId: string,
  secondUserId: string,
  deletedAt: Date,
): Promise<void> {
  await write(
    `/* setReciprocalTestUserDeletionActors */
    UPDATE users SET deleted_at = $3,
      deleted_by_id = CASE WHEN id = $1::uuid THEN $2::uuid ELSE $1::uuid END
    WHERE id IN ($1::uuid, $2::uuid)`,
    [firstUserId, secondUserId, deletedAt],
  )
}
