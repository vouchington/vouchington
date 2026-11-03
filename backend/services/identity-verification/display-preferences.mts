import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import type { PublicVerifiedNameDisplay } from '@voucha/types/entities/user'

type DisplayPreferencesInput = {
  is_verified_badge_visible?: boolean
  public_verified_name_display?: PublicVerifiedNameDisplay
}

/**
 * Update a verified user's badge visibility and public name display preference.
 * Invalidates the user entity cache so changes are reflected immediately.
 */
export async function updateDisplayPreferences(
  userId: string,
  input: DisplayPreferencesInput,
): Promise<void> {
  if (
    input.is_verified_badge_visible === undefined &&
    input.public_verified_name_display === undefined
  ) {
    return
  }

  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(sql`/* updateDisplayPreferences */
      UPDATE users
      SET is_verified_badge_visible = COALESCE(${input.is_verified_badge_visible ?? null}, is_verified_badge_visible),
          public_verified_name_display = COALESCE(${input.public_verified_name_display ?? null}, public_verified_name_display)
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'verified'
    `)
  await transaction.commit()

  if (!rowCount) return

  await invalidate.users(userId)
}
