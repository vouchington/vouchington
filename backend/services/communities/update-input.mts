import assert from 'http-assert'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { validateCommunitySlug } from './slugs.mts'
import type { UpdateCommunityInput } from './update.mts'

export function validateCommunityUpdateInput(input: UpdateCommunityInput): void {
  if (input.name !== undefined) {
    assert(
      input.name.trim() === input.name,
      422,
      'Name must not have leading or trailing whitespace',
    )
    assert(
      input.name.length >= 1 && input.name.length <= 100,
      422,
      'Name must be between 1 and 100 characters',
    )
  }
  if (input.slug !== undefined) validateCommunitySlug(input.slug)
  assert(
    input.default_language == null || typeof input.default_language === 'string',
    422,
    'default_language must be a string or null',
  )
}

export function buildCommunityUpdateStatement(communityId: string, input: UpdateCommunityInput) {
  const statement = sql`/* updateCommunity */ UPDATE communities SET updated_at = CURRENT_TIMESTAMP`
  if (input.name !== undefined) statement.append(sql`, name = ${input.name}`)
  if (input.slug !== undefined) statement.append(sql`, slug = ${input.slug}`)
  if ('markdown' in input) statement.append(sql`, markdown = ${input.markdown ?? null}`)
  if (input.visibility !== undefined) statement.append(sql`, visibility = ${input.visibility}`)
  if (input.member_roster_visibility !== undefined)
    statement.append(sql`, member_roster_visibility = ${input.member_roster_visibility}`)
  if ('list_type' in input) statement.append(sql`, list_type = ${input.list_type ?? null}`)
  if (input.member_invites_allowed_at !== undefined)
    statement.append(sql`, member_invites_allowed_at = ${input.member_invites_allowed_at}`)
  if (input.post_approval_required_at !== undefined)
    statement.append(sql`, post_approval_required_at = ${input.post_approval_required_at}`)
  if ('profile_image_id' in input)
    statement.append(sql`, profile_image_id = ${input.profile_image_id ?? null}`)
  if ('banner_image_id' in input)
    statement.append(sql`, banner_image_id = ${input.banner_image_id ?? null}`)
  if ('default_language' in input) {
    statement.append(
      sql`, default_language = ${normalizeContentLanguageTag(input.default_language ?? null)}`,
    )
  }
  statement.append(sql` WHERE id = ${communityId} AND deleted_at IS NULL`)
  return statement
}
