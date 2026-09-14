import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { PrivateUser } from '@services/users/types'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { validateCommunitySlug } from './slugs.mts'
import { currentUserCanUpdateCommunity } from './authorization.mts'
import type {
  CommunityListType,
  CommunityMember,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
} from './types.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateAllCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordPostPublicationChange } from '@services/post-publication'

export type UpdateCommunityInput = {
  name?: string
  slug?: string
  markdown?: string | null
  visibility?: CommunityVisibility
  member_roster_visibility?: CommunityMemberRosterVisibility
  list_type?: CommunityListType | null
  member_invites_allowed_at?: Date | null
  post_approval_required_at?: Date | null
  profile_image_id?: string | null
  banner_image_id?: string | null
  default_language?: string | null
}

export async function updateCommunity(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityInput,
  membership?: CommunityMember | null,
  options?: QueryOptions,
): Promise<CommunityWithOwner> {
  const invalidatesMemberMetrics =
    input.visibility !== undefined || input.member_roster_visibility !== undefined
  const community = await getCommunity(communityId, options)
  assert(community, 404, 'Community not found')
  assert(currentUserCanUpdateCommunity(currentUser, community, membership), 403, 'Forbidden')

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

  if (input.slug !== undefined) {
    validateCommunitySlug(input.slug)
  }

  const updateQuery = sql`/* updateCommunity */ UPDATE communities SET updated_at = CURRENT_TIMESTAMP`

  if (input.name !== undefined) updateQuery.append(sql`, name = ${input.name}`)
  if (input.slug !== undefined) updateQuery.append(sql`, slug = ${input.slug}`)
  if ('markdown' in input) updateQuery.append(sql`, markdown = ${input.markdown ?? null}`)
  if (input.visibility !== undefined) updateQuery.append(sql`, visibility = ${input.visibility}`)
  if (input.member_roster_visibility !== undefined)
    updateQuery.append(sql`, member_roster_visibility = ${input.member_roster_visibility}`)
  if ('list_type' in input) updateQuery.append(sql`, list_type = ${input.list_type ?? null}`)
  if (input.member_invites_allowed_at !== undefined)
    updateQuery.append(sql`, member_invites_allowed_at = ${input.member_invites_allowed_at}`)
  if (input.post_approval_required_at !== undefined)
    updateQuery.append(sql`, post_approval_required_at = ${input.post_approval_required_at}`)
  if ('profile_image_id' in input)
    updateQuery.append(sql`, profile_image_id = ${input.profile_image_id ?? null}`)
  if ('banner_image_id' in input)
    updateQuery.append(sql`, banner_image_id = ${input.banner_image_id ?? null}`)
  if ('default_language' in input) {
    assert(
      input.default_language == null || typeof input.default_language === 'string',
      422,
      'default_language must be a string or null',
    )
    updateQuery.append(
      sql`, default_language = ${normalizeContentLanguageTag(input.default_language ?? null)}`,
    )
  }

  updateQuery.append(sql` WHERE id = ${communityId} AND deleted_at IS NULL`)

  const run = async (query: TransactionQuery): Promise<void> => {
    const { rows: lockedRows } = await query<{
      visibility: CommunityVisibility
      slug: string
    }>(
      `/* updateCommunity:lockPublicationInputs */
      SELECT visibility, slug FROM communities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [communityId],
    )
    const locked = lockedRows[0]
    const publicationChanged =
      locked != null &&
      ((input.visibility !== undefined && input.visibility !== locked.visibility) ||
        (input.slug !== undefined && input.slug !== locked.slug))
    const { rowCount } = await query(updateQuery.text, updateQuery.values)
    if ((rowCount ?? 0) > 0 && publicationChanged) {
      await recordPostPublicationChange(query, {
        scope: { type: 'community', communityId },
        reason: 'community_visibility_changed',
        impactedCommunityIds: [communityId],
        footprint: { priorCommunityId: communityId, priorCommunitySlug: locked.slug },
      })
    }
  }

  try {
    if (options?.query || options?.client) {
      await withTransactionOptions(options, run)
    } else {
      await using transaction = await beginTransaction()
      await run(transaction)
      await transaction.commit()
    }
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      throw createHttpError(409, `Slug "${input.slug}" is already taken`)
    }
    throw error
  }

  const updated = await getCommunity(communityId, options)
  assert(updated, 404, 'Community not found after update')
  entityCacheBloomFilters.communities.add([normalizeKey(updated.id), normalizeKey(updated.slug)])
  if (!options?.query) {
    await Promise.all([
      invalidate.communities(community, updated),
      invalidatesMemberMetrics
        ? invalidateAllCommunityMemberUserMetrics(communityId)
        : Promise.resolve(),
    ])
    if (community.visibility !== updated.visibility) void enqueueRefreshTopHashtags()
  }
  // Language detection is asynchronous enrichment; the committed community update remains durable.
  void enqueueLanguageDetection('community', updated.id).catch(onError)
  return updated
}
