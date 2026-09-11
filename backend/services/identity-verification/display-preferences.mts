import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import type { PublicVerifiedNameDisplay } from '@voucha/types/entities/user'

type DisplayPreferencesInput = {
  verified_badge_visible?: boolean
  public_verified_name_display?: PublicVerifiedNameDisplay
}

type DisplayPreferencesDependencies = {
  invalidateUsers: typeof invalidate.users
  beginTransaction: typeof beginTransaction
}

/**
 * Update a verified user's badge visibility and public name display preference.
 * Invalidates the user entity cache so changes are reflected immediately.
 */
export async function updateDisplayPreferences(
  userId: string,
  input: DisplayPreferencesInput,
  dependencies?: Partial<DisplayPreferencesDependencies>,
): Promise<void> {
  if (
    input.verified_badge_visible === undefined &&
    input.public_verified_name_display === undefined
  ) {
    return
  }

  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  const { rowCount } = await transaction(sql`/* updateDisplayPreferences */
      UPDATE users
      SET verified_badge_visible = COALESCE(${input.verified_badge_visible ?? null}, verified_badge_visible),
          public_verified_name_display = COALESCE(${input.public_verified_name_display ?? null}, public_verified_name_display)
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'verified'
    `)
  await transaction.commit()

  if (!rowCount) return

  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  await invalidateUsers(userId)
}
