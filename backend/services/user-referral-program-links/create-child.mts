import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import { isUrlReferralLink } from '@services/referral-program-link-validations'
import { addUrl } from '@services/urls/upsert'
import type { UserReferralLink } from './types.mts'

/**
 * Creates (or re-activates) a child referral link produced by unfurling a parent link.
 * Unlike `createUserReferralLink`, this is an internal helper with no caller-facing
 * authorization: the acting user's right to unfurl is already established by
 * `requestReferralLinkUnfurl` before the unfurl processor ever reaches this function.
 *
 * The upsert's `ON CONFLICT ... DO UPDATE ... WHERE parent_link_id IS NOT NULL` guard
 * ensures a manually-added link is never silently converted into a child: if the same
 * (user, program, url) row already exists as a manual link, the conflicting row is left
 * untouched and no row is returned.
 */
export async function createChildReferralLink(
  currentUserId: string,
  data: {
    userId: string
    referralProgramId: string
    url: string
    parentLinkId: string
    label?: string | null
  },
  options?: QueryOptions,
): Promise<UserReferralLink> {
  validateUUID(currentUserId)
  validateUUID(data.userId)
  validateUUID(data.referralProgramId)
  validateUUID(data.parentLinkId)

  const validationResult = await isUrlReferralLink(data.url, {
    referral_program_id: data.referralProgramId,
  })
  assert(
    validationResult.is_valid,
    422,
    validationResult.user_error_text || 'Invalid referral link URL',
  )
  assert(
    validationResult.referral_program_id === data.referralProgramId,
    422,
    'URL does not match the specified referral program',
  )

  const urlRecord = await addUrl(currentUserId, data.url, options)
  assert(urlRecord, 500, 'Failed to create URL record')

  const rawLabel = data.label
  const label = typeof rawLabel === 'string' ? rawLabel.trim() || null : null
  if (label) {
    assert(label.length <= 255, 422, 'label must be 255 characters or less')
  }

  const { rows } = await write(
    sql`/* createChildReferralLink */
      INSERT INTO user_referral_program_links (
        user_id,
        referral_program_id,
        url_id,
        parent_link_id,
        label,
        activated_at
      )
      VALUES (
        ${data.userId},
        ${data.referralProgramId},
        ${urlRecord.id},
        ${data.parentLinkId},
        ${label},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, referral_program_id, url_id)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        parent_link_id = EXCLUDED.parent_link_id,
        label = COALESCE(EXCLUDED.label, user_referral_program_links.label),
        activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL
      WHERE user_referral_program_links.parent_link_id IS NOT NULL
      RETURNING *
    `,
    options,
  )

  assert(rows[0], 409, 'Referral link already exists as a manually-added link')

  return rows[0]
}
