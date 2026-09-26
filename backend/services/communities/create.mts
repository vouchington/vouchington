import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { v7 as uuidv7 } from 'uuid'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { normalizeKey } from '@ts-shared/utils/strings'
import { validateCommunitySlug, generateCommunitySlug } from './slugs.mts'
import type {
  Community,
  CommunityListType,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
} from './types.mts'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { validateCreateCommunityInput } from './create-validation.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'

export type CreateCommunityInput = {
  name: string
  slug?: string
  markdown?: string
  visibility?: CommunityVisibility
  list_type?: CommunityListType | null
  member_roster_visibility?: CommunityMemberRosterVisibility
  member_invites_allowed_at?: Date | null
  post_approval_required_at?: Date | null
  allow_review_posts?: boolean
  allow_data_point_posts?: boolean
  profile_image_id?: string | null
  banner_image_id?: string | null
  default_language?: string | null
}

export async function createCommunity(
  provenance: ContentProvenance,
  currentUserId: string,
  input: CreateCommunityInput,
): Promise<CommunityWithOwner> {
  validateCreateCommunityInput(input)

  const name = input.name
  const id = uuidv7()
  const slug = input.slug ? validateCommunitySlug(input.slug) : generateCommunitySlug(name, id)
  const defaultLanguage = normalizeContentLanguageTag(input.default_language ?? null)

  let community: CommunityWithOwner | null
  try {
    await using query = await beginTransaction()
    const options = { query }

    const { rows } = await write(
      sql`/* createCommunity */
    INSERT INTO communities (
      id,
      name,
      slug,
      markdown,
      visibility,
      list_type,
      member_roster_visibility,
      member_invites_allowed_at,
      post_approval_required_at,
      allow_review_posts,
      allow_data_point_posts,
      profile_image_id,
      banner_image_id,
      created_by_id,
      default_language,
      created_via,
      created_via_oauth_client_id
    )
    VALUES (
      ${id},
      ${name},
      ${slug},
      ${input.markdown ?? null},
      ${input.visibility ?? 'public'},
      ${input.list_type ?? null},
      ${input.member_roster_visibility ?? 'public'},
      ${input.member_invites_allowed_at ?? null},
      ${input.post_approval_required_at ?? null},
      ${input.allow_review_posts ?? false},
      ${input.allow_data_point_posts ?? false},
      ${input.profile_image_id ?? null},
      ${input.banner_image_id ?? null},
      ${currentUserId},
      ${defaultLanguage},
      ${provenance.createdVia},
      ${provenance.oauthClientId}
    )
    RETURNING *
    `,
      options,
    )

    const newCommunity = rows[0] as Community

    await write(
      sql`/* createCommunity */
    INSERT INTO community_members (community_id, user_id, role)
    VALUES (${newCommunity.id}, ${currentUserId}, 'owner')
    `,
      options,
    )

    community = await getCommunity(newCommunity.id, options)
    await query.commit()
    void enqueueReconcileMediaDeliveryRegistry()
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23505') {
      throw createHttpError(409, `Slug "${slug}" is already taken`)
    }
    throw error
  }

  assert(community, 500, 'Failed to create community')
  entityCacheBloomFilters.communities.add([
    normalizeKey(community.id),
    normalizeKey(community.slug),
  ])
  await Promise.all([
    invalidate.communities(community),
    invalidateCommunityMemberUserMetrics(currentUserId),
  ])
  // Language detection is asynchronous enrichment; the committed community remains durable.
  void enqueueLanguageDetection('community', community.id).catch(onError)
  return community
}

export { validateCreateCommunityInput } from './create-validation.mts'
