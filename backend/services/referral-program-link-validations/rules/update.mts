import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { validateUUID } from '@modules/utils'
import { validateOptionalString } from '@services/topics/validation'
import { getReferralLinkValidationRule } from './get.mts'
import type { ReferralLinkValidationRule } from './types.mts'
import { withReferralLinkEligibilityMutationLock } from '@services/entity-relations/referral-link-eligibility-lock'

export async function updateReferralLinkValidationRule(
  currentUser: PrivateUser | null,
  validationId: string,
  ruleId: string,
  data: {
    hostname?: string
    pathname?: string
    is_referral_link_url?: boolean
    is_invalid_referral_link_url?: boolean
    user_error_text?: string | null
    example_urls?: string[] | null
  },
): Promise<ReferralLinkValidationRule | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  validateUUID(validationId)
  validateUUID(ruleId)

  const existing = await getReferralLinkValidationRule(ruleId)
  assert(existing, 404, 'Rule not found')
  assert(existing.referral_program_link_validation_id === validationId, 404, 'Rule not found')

  let nextIsReferralLinkUrl = existing.is_referral_link_url
  let nextIsInvalidReferralLinkUrl = existing.is_invalid_referral_link_url
  let nextUserErrorText = existing.user_error_text

  const query = sql`/* updateReferralLinkValidationRule */ UPDATE referral_program_link_validations_rules SET `
  let hasUpdates = false

  const appendSet = (fragment: ReturnType<typeof sql>) => {
    if (hasUpdates) query.append(sql`, `)
    query.append(fragment)
    hasUpdates = true
  }

  if (data.hostname !== undefined) {
    const hostname = data.hostname.toLowerCase().trim()
    assert(hostname, 422, 'hostname cannot be empty')
    assert(hostname.length <= 255, 422, 'hostname must be 255 characters or less')
    appendSet(sql`hostname = ${hostname}`)
  }

  if (data.pathname !== undefined) {
    const pathname = data.pathname.trim()
    assert(pathname, 422, 'pathname cannot be empty')
    appendSet(sql`pathname = ${pathname}`)
  }

  if (data.is_referral_link_url !== undefined) {
    assert(
      typeof data.is_referral_link_url === 'boolean',
      422,
      'is_referral_link_url must be a boolean',
    )
    nextIsReferralLinkUrl = data.is_referral_link_url
    appendSet(sql`is_referral_link_url = ${data.is_referral_link_url}`)
  }

  if (data.is_invalid_referral_link_url !== undefined) {
    assert(
      typeof data.is_invalid_referral_link_url === 'boolean',
      422,
      'is_invalid_referral_link_url must be a boolean',
    )
    nextIsInvalidReferralLinkUrl = data.is_invalid_referral_link_url
    appendSet(sql`is_invalid_referral_link_url = ${data.is_invalid_referral_link_url}`)
  }

  if (data.user_error_text !== undefined) {
    validateOptionalString(data.user_error_text, 'user_error_text')
    const userErrorText = data.user_error_text?.trim() || null
    nextUserErrorText = userErrorText
    appendSet(sql`user_error_text = ${userErrorText}`)
  }

  if (data.example_urls !== undefined) {
    let exampleUrls: string[] | null = null
    if (data.example_urls !== null) {
      assert(Array.isArray(data.example_urls), 422, 'example_urls must be an array')
      for (const url of data.example_urls) {
        assert(typeof url === 'string', 422, 'example_urls must contain only strings')
      }
      exampleUrls = data.example_urls.flatMap(url => (url.trim() ? [url.trim()] : []))
      if (exampleUrls.length === 0) {
        exampleUrls = null
      }
    }
    appendSet(sql`example_urls = ${exampleUrls}`)
  }

  if (!hasUpdates) {
    return existing
  }

  if (!nextIsReferralLinkUrl) {
    assert(nextUserErrorText, 422, 'user_error_text is required when is_referral_link_url is false')
  }

  if (nextIsInvalidReferralLinkUrl) {
    assert(
      nextUserErrorText,
      422,
      'user_error_text is required when is_invalid_referral_link_url is true',
    )
  }

  query.append(sql` WHERE id = ${ruleId} RETURNING *`)

  return withReferralLinkEligibilityMutationLock({}, async transactionQuery => {
    const { rows } = await transactionQuery(query)
    return rows[0] ?? null
  })
}
