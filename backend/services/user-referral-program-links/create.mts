import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { isUrlReferralLink } from '@services/referral-program-link-validations'
import { addUrl } from '@services/urls/upsert'
import { assertCurrentUserCanCreateUserReferralLink } from './authorization.mts'
import type { UserReferralLink } from './types.mts'
import { userReferralLinkColumns } from './columns.mts'

export async function createUserReferralLink(
  currentUser: PrivateUser | null,
  data: {
    user_id: string
    referral_program_id: string
    url: string
    label?: string | null
  },
): Promise<UserReferralLink> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(data.user_id)
  validateUUID(data.referral_program_id)

  assertCurrentUserCanCreateUserReferralLink(currentUser, data.user_id)

  const validationResult = await isUrlReferralLink(data.url, {
    referral_program_id: data.referral_program_id,
  })

  assert(
    validationResult.is_valid,
    422,
    validationResult.user_error_text || 'Invalid referral link URL',
  )

  assert(
    validationResult.referral_program_id === data.referral_program_id,
    422,
    'URL does not match the specified referral program',
  )

  const urlRecord = await addUrl(currentUser.id, data.url)
  assert(urlRecord, 500, 'Failed to create URL record')

  const rawLabel = data.label
  if (rawLabel != null) {
    assert(typeof rawLabel === 'string', 422, 'label must be a string')
  }

  const label = typeof rawLabel === 'string' ? rawLabel.trim() || null : null
  if (label) {
    assert(label.length <= 255, 422, 'label must be 255 characters or less')
  }

  const { rows } = await write(
    sql`/* createUserReferralLink */
      INSERT INTO user_referral_program_links (
        user_id,
        referral_program_id,
        url_id,
        label,
        activated_at
      )
      VALUES (
        ${data.user_id},
        ${data.referral_program_id},
        ${urlRecord.id},
        ${label},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, referral_program_id, url_id)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        label = COALESCE(EXCLUDED.label, user_referral_program_links.label),
        activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL
      RETURNING `.append(userReferralLinkColumns()),
  )

  return rows[0]
}
