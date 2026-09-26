import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { validateUUID } from '@modules/utils'
import { assertReferralLinkValidationExists } from '@services/topics/validation'
import type { ReferralLinkValidationRule } from './types.mts'
import { withReferralLinkEligibilityMutationLock } from '@services/entity-relations/referral-link-eligibility-lock'

export async function createReferralLinkValidationRule(
  currentUser: PrivateUser | null,
  validationId: string,
  data: {
    hostname: string
    pathname: string
    is_referral_link_url?: boolean | null
    is_invalid_referral_link_url?: boolean | null
    user_error_text?: string | null
    example_urls?: string[] | null
  },
): Promise<ReferralLinkValidationRule> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  validateUUID(validationId)
  await assertReferralLinkValidationExists(validationId, 'referral_program_link_validation_id')

  const hostname = data.hostname.toLowerCase().trim()
  assert(hostname, 422, 'hostname is required')
  assert(hostname.length <= 255, 422, 'hostname must be 255 characters or less')

  const pathname = data.pathname.trim()
  assert(pathname, 422, 'pathname is required')

  const isReferralLinkUrl = data.is_referral_link_url ?? true
  const isInvalidReferralLinkUrl = data.is_invalid_referral_link_url ?? false
  const userErrorText = data.user_error_text?.trim() || null

  if (!isReferralLinkUrl) {
    assert(userErrorText, 422, 'user_error_text is required when is_referral_link_url is false')
  }

  if (isInvalidReferralLinkUrl) {
    assert(
      userErrorText,
      422,
      'user_error_text is required when is_invalid_referral_link_url is true',
    )
  }

  let exampleUrls: string[] | null = null
  if (data.example_urls !== undefined && data.example_urls !== null) {
    assert(Array.isArray(data.example_urls), 422, 'example_urls must be an array')
    for (const url of data.example_urls) {
      assert(typeof url === 'string', 422, 'example_urls must contain only strings')
    }
    exampleUrls = data.example_urls.flatMap(url => (url.trim() ? [url.trim()] : []))
    if (exampleUrls.length === 0) {
      exampleUrls = null
    }
  }

  return withReferralLinkEligibilityMutationLock({}, async query => {
    const { rows } = await query(sql`/* createReferralLinkValidationRule */
      INSERT INTO referral_program_link_validations_rules (
        referral_program_link_validation_id,
        hostname,
        pathname,
        is_referral_link_url,
        is_invalid_referral_link_url,
        user_error_text,
        example_urls
      )
      VALUES (
        ${validationId},
        ${hostname},
        ${pathname},
        ${isReferralLinkUrl},
        ${isInvalidReferralLinkUrl},
        ${userErrorText},
        ${exampleUrls}
      )
      RETURNING *
    `)
    return rows[0]
  })
}
