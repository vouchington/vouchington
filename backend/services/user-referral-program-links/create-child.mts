import type { QueryOptions } from '@data-stores/psql'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { validateReferralLinkUrls } from '@services/referral-program-link-validations'
import { assessUrls } from '@services/urls/upsert'
import { persistAssessedUrls, type AssessedUrls } from '@services/urls/upsert-persist'
import type { UserReferralLink } from './types.mts'
import { insertChildReferralLinkRows } from './create-child-write.mts'

type ChildReferralLinkInput = {
  userId: string
  referralProgramId: string
  url: string
  parentLinkId: string
  label?: string | null
}
type ChildReferralLinkOptions = QueryOptions & { assessedUrls?: AssessedUrls }

/** Internal unfurl batch. Manual links remain untouched and are omitted from the result. */
export async function createChildReferralLinks(
  currentUserId: string,
  provenance: ContentProvenance,
  inputs: ChildReferralLinkInput[],
  { assessedUrls, ...options }: ChildReferralLinkOptions = {},
): Promise<UserReferralLink[]> {
  if (inputs.length === 0) return []
  validateUUID(currentUserId)
  for (const input of inputs) {
    validateUUID(input.userId)
    validateUUID(input.referralProgramId)
    validateUUID(input.parentLinkId)
  }
  const validations = await validateReferralLinkUrls(
    inputs.map(input => input.url),
    { referralProgramIds: inputs.map(input => input.referralProgramId) },
  )
  const candidates = inputs.map((input, index) => {
    const validation = validations[index]!
    assert(validation.is_valid, 422, validation.user_error_text || 'Invalid referral link URL')
    assert(
      validation.referral_program_id === input.referralProgramId,
      422,
      'URL does not match the specified referral program',
    )
    const label = typeof input.label === 'string' ? input.label.trim() || null : null
    return { ...input, label }
  })
  const assessment = assessedUrls ?? (await assessUrls(candidates.map(input => input.url)))
  const urls = await persistAssessedUrls(currentUserId, assessment, options)
  for (const { label } of candidates)
    assert(!label || label.length <= 255, 422, 'label must be 255 characters or less')
  const byHref = new Map(urls.map(url => [url.url, url.id]))
  const rowsToInsert = candidates.map(input => {
    const urlId = byHref.get(normalizeUrlForUrlTable(input.url).toString())
    assert(urlId, 500, 'Failed to create URL record')
    return { ...input, urlId }
  })
  return insertChildReferralLinkRows(provenance, rowsToInsert, options)
}

/** Retained for callers that create one child and need the existing manual-link 409. */
export async function createChildReferralLink(
  currentUserId: string,
  provenance: ContentProvenance,
  input: ChildReferralLinkInput,
  options?: ChildReferralLinkOptions,
): Promise<UserReferralLink> {
  const [row] = await createChildReferralLinks(currentUserId, provenance, [input], options)
  assert(row, 409, 'Referral link already exists as a manually-added link')
  return row
}
