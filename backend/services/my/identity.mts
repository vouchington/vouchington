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
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
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
    async (references, scopeQuery) => {
      const statement = imageSurfaceMutationPreimage(references, 'updateProfileImageId')
      statement.append(sql`, updated AS (
        UPDATE users SET profile_image_id = ${profileImageId}
        FROM surface_preimage before
        WHERE users.id = ${userId} AND users.deleted_at IS NULL
          AND before.ordinality = 1
          AND users.profile_image_id IS NOT DISTINCT FROM before.current_image_id
        RETURNING WITH (OLD AS prior, NEW AS current)
          before.ordinality::int AS ordinality,
          prior.profile_image_id AS previous_image_id,
          current.profile_image_id AS current_image_id,
          before.placement_id AS previous_placement_id,
          before.placement_revision AS previous_placement_revision,
          before.activation_revision AS previous_activation_revision
      ) SELECT * FROM updated`)
      const { rows } = await scopeQuery<{
        ordinality: number
        previous_image_id: string | null
        current_image_id: string | null
        previous_placement_id: string | null
        previous_placement_revision: number | null
        previous_activation_revision: number | null
      }>(statement)
      assert(rows.length === 1, 409, 'User or profile image changed')
      return {
        result: undefined,
        changes: rows.map(row =>
          imageSurfaceMutationChange({
            ordinality: row.ordinality,
            previousImageId: row.previous_image_id,
            currentImageId: row.current_image_id,
            previousPlacementId: row.previous_placement_id,
            previousPlacementRevision: row.previous_placement_revision,
            previousActivationRevision: row.previous_activation_revision,
          }),
        ),
      }
    },
  )
  await transaction.commit()
  clearRequestCurrentUser(userId)
  void enqueueReconcileMediaDeliveryRegistry()
  void enqueueOnUserUpdated(userId)
}
