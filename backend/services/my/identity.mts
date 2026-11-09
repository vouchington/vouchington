import { beginTransaction, read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { clearRequestCurrentUser } from '@modules/utils/request-context'
import { validateUsername } from '@modules/utils'
import onError from '@modules/on-error'
import { getPrivateUserByAny } from '@services/users'
import { commitUserUpdateOperation } from '@services/users/update-username-publication'
import { ensureDefaultLandingPage } from './landing-pages/index.mts'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'

export async function updateUsername(userId: string, username: string): Promise<void> {
  const validated = validateUsername(username)
  const existing = await getPrivateUserByAny(validated)
  assert(!existing || existing.id === userId, 422, `Username ${username} is already taken`)
  const input = sql`UPDATE users SET username = ${validated}`
  input.append(sql` WHERE id = ${userId} AND deleted_at IS NULL`)
  input.append(sql` RETURNING WITH (OLD AS prior) prior.username AS previous_username`)
  await commitUserUpdateOperation(userId, 'identity', input, validated)
  clearRequestCurrentUser(userId)
  void enqueueOnUserUpdated(userId)
  ensureDefaultLandingPage(userId, validated).catch(onError)
}

export async function updateProfileImageId(
  userId: string,
  profileImageId: string | null,
): Promise<void> {
  if (profileImageId !== null) {
    const { rows } = await read(
      sql`/* updateProfileImageId */ SELECT id FROM images WHERE id = ${profileImageId} AND created_by_id = ${userId} AND deleted_at IS NULL AND quarantine_pending_at IS NULL LIMIT 1`,
    )
    assert(rows.length > 0, 400, 'Image not found or does not belong to you')
  }
  await using transaction = await beginTransaction()
  await writeImageSurfaceMutation(
    transaction,
    [{ surfaceKind: 'user-profile-image', userId, nextImageId: profileImageId }],
    userId,
    async (before, scopeQuery) => {
      const { rowCount } = await scopeQuery(sql`/* updateProfileImageId */
        UPDATE users SET profile_image_id = ${profileImageId}
        WHERE id = ${userId} AND deleted_at IS NULL
          AND profile_image_id IS NOT DISTINCT FROM ${before[0]!.current_image_id}::uuid`)
      assert(rowCount === 1, 409, 'User or profile image changed')
    },
  )
  await transaction.commit()
  clearRequestCurrentUser(userId)
  void enqueueReconcileMediaDeliveryRegistry()
  void enqueueOnUserUpdated(userId)
}
