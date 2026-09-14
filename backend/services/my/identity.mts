import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { validateUsername } from '@modules/utils'
import onError from '@modules/on-error'
import { getPrivateUserByAny } from '@services/users'
import { ensureDefaultLandingPage } from './landing-pages/index.mts'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'

export async function updateUsername(userId: string, username: string): Promise<void> {
  const validated = validateUsername(username)
  const existing = await getPrivateUserByAny(validated)
  assert(!existing || existing.id === userId, 422, `Username ${username} is already taken`)

  await write(
    sql`/* updateUsername */ UPDATE users SET username = ${validated} WHERE id = ${userId} AND deleted_at IS NULL`,
  )
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
  await write(
    sql`/* updateProfileImageId */ UPDATE users SET profile_image_id = ${profileImageId} WHERE id = ${userId} AND deleted_at IS NULL`,
  )
  void enqueueOnUserUpdated(userId)
}
