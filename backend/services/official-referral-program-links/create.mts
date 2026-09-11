import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isUrlReferralLink } from '@services/referral-program-link-validations'
import { addUrl } from '@services/urls/upsert'
import { getPrivateUserByAny } from '@services/users'
import { validateUUID } from '@modules/utils'
import { currentUserCanManageOfficialReferralLink } from './authorization.mts'
import type { OfficialReferralLink } from './types.mts'

export async function createOfficialReferralLink(
  currentUser: PrivateUser | null,
  data: {
    referral_program_id: string
    url: string
    label?: string | null
  },
): Promise<OfficialReferralLink> {
  assert(currentUser, 401, 'Unauthorized')
  validateUUID(data.referral_program_id)
  assert(currentUserCanManageOfficialReferralLink(currentUser), 403, 'Forbidden')

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
  const label = typeof rawLabel === 'string' ? rawLabel.trim() || null : null
  if (label) {
    assert(label.length <= 255, 422, 'label must be 255 characters or less')
  }

  // Get the @voucha system user
  const vouchaUser = await getPrivateUserByAny('voucha')
  assert(vouchaUser, 500, 'Voucha system user not found')

  const { rows } = await write(sql`/* createOfficialReferralLink */
    INSERT INTO user_referral_program_links (
      user_id,
      referral_program_id,
      url_id,
      label,
      activated_at,
      created_by_id
    )
    VALUES (
      ${vouchaUser.id},
      ${data.referral_program_id},
      ${urlRecord.id},
      ${label},
      CURRENT_TIMESTAMP,
      ${currentUser.id}
    )
    ON CONFLICT (user_id, referral_program_id, url_id) WHERE deleted_at IS NULL
    DO NOTHING
    RETURNING *
  `)

  assert(rows.length > 0, 409, 'An active official link for this URL already exists')

  return { ...rows[0], url: data.url }
}
