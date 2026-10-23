import { write, type QueryOptions } from '@data-stores/psql'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { UserReferralLink } from './types.mts'
import { userReferralLinkColumns } from './columns.mts'
import sql from 'sql-template-strings'
import { withTopicReferenceAttachmentFences } from '@services/topics/reference-attachment-fence'

type ResolvedChildReferralLink = {
  userId: string
  referralProgramId: string
  urlId: string
  parentLinkId: string
  label: string | null
}

/** Validated unfurl candidates, with manual-link conflicts left untouched. */
export async function insertChildReferralLinkRows(
  provenance: ContentProvenance,
  inputs: ResolvedChildReferralLink[],
  options: QueryOptions,
): Promise<UserReferralLink[]> {
  if (inputs.length === 0) return []
  const unique = new Map<string, ResolvedChildReferralLink>()
  for (const input of inputs) {
    const key = `${input.userId}:${input.referralProgramId}:${input.urlId}`
    const previous = unique.get(key)
    unique.set(key, { ...input, label: input.label ?? previous?.label ?? null })
  }
  const rowsToInsert = [...unique.values()]
  const { rows } = await withTopicReferenceAttachmentFences(
    rowsToInsert.map(input => input.referralProgramId),
    options,
    query =>
      write<UserReferralLink>(
        sql`/* createChildReferralLinks */
      INSERT INTO user_referral_program_links (
        user_id, referral_program_topic_id, url_id, parent_link_id, label, activated_at,
        created_via, created_via_oauth_client_id
      )
      SELECT input.user_id, input.program_id, input.url_id, input.parent_id, input.label,
        CURRENT_TIMESTAMP, ${provenance.createdVia}, ${provenance.oauthClientId}
      FROM unnest(
        ${rowsToInsert.map(input => input.userId)}::uuid[],
        ${rowsToInsert.map(input => input.referralProgramId)}::uuid[],
        ${rowsToInsert.map(input => input.urlId)}::uuid[],
        ${rowsToInsert.map(input => input.parentLinkId)}::uuid[],
        ${rowsToInsert.map(input => input.label)}::text[]
      ) AS input(user_id, program_id, url_id, parent_id, label)
      ORDER BY user_id, program_id, url_id
      ON CONFLICT (user_id, referral_program_topic_id, url_id) WHERE deleted_at IS NULL
      DO UPDATE SET parent_link_id = EXCLUDED.parent_link_id,
        label = COALESCE(EXCLUDED.label, user_referral_program_links.label),
        activated_at = CURRENT_TIMESTAMP, deactivated_at = NULL
      WHERE user_referral_program_links.parent_link_id IS NOT NULL
      RETURNING `.append(userReferralLinkColumns()),
        { query },
      ),
  )
  return rows
}
