import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { validateOptionalString } from '@services/topics/validation'
import { isUUID, validateUUID } from '@modules/utils'
import { withReferralLinkEligibilityMutationLock } from '@services/entity-relations/referral-link-eligibility-lock'
export type ReferralLinkValidation = {
  id: string
  slug: string
  user_help_text: string
  updated_at: string
}

export async function getReferralLinkValidationBySlug(
  slug: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidation | null> {
  const { rows } = await read(
    sql`/* getReferralLinkValidationBySlug */
      SELECT id, slug, user_help_text, updated_at
      FROM referral_program_link_validations
      WHERE slug = ${slug}
      LIMIT 1
    `,
    options,
  )
  return rows[0] ?? null
}

async function getReferralLinkValidationById(
  id: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidation | null> {
  validateUUID(id)
  const { rows } = await read(
    sql`/* getReferralLinkValidationById */
      SELECT id, slug, user_help_text, updated_at
      FROM referral_program_link_validations
      WHERE id = ${id}
      LIMIT 1
    `,
    options,
  )
  return rows[0] ?? null
}

export async function createReferralLinkValidation(
  currentUser: PrivateUser | null,
  data: {
    slug: string
    user_help_text?: string | null
  },
  options?: QueryOptions,
): Promise<ReferralLinkValidation> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  const slug = data.slug.trim()
  assert(slug, 422, 'slug is required')
  assert(slug.length <= 255, 422, 'slug must be 255 characters or less')
  assert(slug === slug.toLowerCase(), 422, 'slug must be lowercase')
  assert(
    /^[a-z0-9_]+$/.test(slug),
    422,
    'slug must contain only lowercase letters, numbers, and underscores',
  )

  const userHelpText = data.user_help_text?.trim() ?? ''

  const { rows } = await write(
    sql`/* createReferralLinkValidation */
      INSERT INTO referral_program_link_validations (slug, user_help_text)
      VALUES (${slug}, ${userHelpText})
      RETURNING id, slug, user_help_text, updated_at
    `,
    options,
  )

  return rows[0]
}

export async function updateReferralLinkValidation(
  currentUser: PrivateUser | null,
  idOrSlug: string,
  data: {
    slug?: string
    user_help_text?: string | null
  },
): Promise<ReferralLinkValidation | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  // Resolve idOrSlug to actual validation
  const validation = await getReferralLinkValidation(idOrSlug)
  assert(validation, 404, 'Validation not found')
  const validationId = validation.id

  let slug: string | undefined
  if (data.slug !== undefined) {
    slug = data.slug.trim()
    assert(slug, 422, 'slug cannot be empty')
    assert(slug.length <= 255, 422, 'slug must be 255 characters or less')
    assert(slug === slug.toLowerCase(), 422, 'slug must be lowercase')
    assert(
      /^[a-z0-9_]+$/.test(slug),
      422,
      'slug must contain only lowercase letters, numbers, and underscores',
    )
  }

  let userHelpText: string | undefined
  if (data.user_help_text !== undefined) {
    validateOptionalString(data.user_help_text, 'user_help_text')
    userHelpText = data.user_help_text?.trim() ?? ''
  }

  if (slug === undefined && userHelpText === undefined) {
    return getReferralLinkValidationById(validationId)
  }

  const query = sql`/* updateReferralLinkValidation */ UPDATE referral_program_link_validations SET `
  let hasUpdates = false

  const appendSet = (fragment: ReturnType<typeof sql>) => {
    if (hasUpdates) query.append(sql`, `)
    query.append(fragment)
    hasUpdates = true
  }

  if (slug !== undefined) {
    appendSet(sql`slug = ${slug}`)
  }
  if (userHelpText !== undefined) {
    appendSet(sql`user_help_text = ${userHelpText}`)
  }

  query.append(sql` WHERE id = ${validationId} RETURNING id, slug, user_help_text, updated_at`)

  const { rows } = await write(query)

  return rows[0] ?? null
}

export async function deleteReferralLinkValidation(
  currentUser: PrivateUser | null,
  idOrSlug: string,
): Promise<void> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  // Resolve idOrSlug to actual validation
  const validation = await getReferralLinkValidation(idOrSlug)
  assert(validation, 404, 'Validation not found')
  const validationId = validation.id

  await withReferralLinkEligibilityMutationLock({}, query =>
    query(sql`/* deleteReferralLinkValidation */
        DELETE FROM referral_program_link_validations
        WHERE id = ${validationId}
      `),
  )
}

export async function getReferralLinkValidation(
  idOrSlug: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidation | null> {
  // Try as UUID first
  if (isUUID(idOrSlug)) {
    return await getReferralLinkValidationById(idOrSlug, options)
  }
  // Otherwise treat as slug
  return await getReferralLinkValidationBySlug(idOrSlug, options)
}
