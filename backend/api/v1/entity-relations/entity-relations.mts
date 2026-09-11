/* eslint-disable max-lines */
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getEntityRelations,
  getEntityRelationsPage,
  type EntityRelationResult,
  type PublicEntityRelationResult,
} from '@services/entity-relations/query'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import {
  parseEntityRelationCreateInput,
  parseEntityRelationSearchInput,
} from '@services/entity-relations'
import { getEntityRelationElectionVotesByUser } from '@services/elections-votes/entity-relation'
import { refreshEntityRelationVoteStatsFromPrimaryWithFallback } from '@services/elections-votes/entity-relation/refresh-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getEntityRelationElectionByIdCachedBatch } from '@services/entity-fetch/get'
import { indexById } from '@modules/utils'
import { getPublicUserByIdOrSlug, isAdminUser, assertNotSuspended } from '@services/users'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  defineQueryContract,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryNumber,
  queryString,
} from '@modules/pagination'
import {
  getCommunity,
  getCommunityMember,
  currentUserCanModerateCommunity,
} from '@services/communities'
import { assertUserTagAllowed } from './user-tag-access.mts'
import { getUserActivePlan } from '@services/memberships'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { assertWithinTagAddLimit } from '@services/tag-limits'
import {
  encodeEntityRelationCursor,
  parseEntityRelationCursor,
  withoutEntityRelationCursorMetadata,
} from './cursor.mts'

const entityRelationsQuery = defineQueryContract({
  after: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 200 }),
  minNetVoteScore: queryNumber(),
  positiveNetVoteScore: queryBoolean(),
  sort: queryEnum(['best', 'newest'] as const),
  summary: queryBoolean(),
})

// GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType
// List entity relations for a given subject
app
  .route('/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      entityRelationsQuery,
    )
    await ctx.applyRouteRateLimit(
      'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
    )
    // topic_alias is an internal category projection used by authored-content and RSS flows.
    // It deliberately has no generic public entity surface; callers consume typed category data.
    ctx.assert(
      ctx.params.entityType !== 'topic_alias' && ctx.params.objectType !== 'topic_alias',
      404,
      'Not found',
    )

    const parsed = parseEntityRelationSearchInput({
      entityType: ctx.params.entityType!,
      entityId: ctx.params.entityId!,
      predicate: ctx.params.predicate!,
      objectType: ctx.params.objectType!,
      minNetVoteScore: ctx.query.minNetVoteScore,
      positiveNetVoteScore: ctx.query.positiveNetVoteScore,
      sort: ctx.query.sort,
      limit: ctx.query.limit,
      summary: ctx.query.summary,
    })

    let resolvedSubjectId = parsed.subjectId
    if (parsed.entityType === 'user') {
      await requireAuth(
        ctx,
        'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      )
      const target = await getPublicUserByIdOrSlug(parsed.subjectId, { readOnly: false })
      ctx.assert(target, 404, 'User not found')
      resolvedSubjectId = target.id
    }

    const cursorScopeParts = [
      'entity-relations',
      parsed.entityType,
      resolvedSubjectId,
      parsed.predicate,
      parsed.objectType,
      parsed.options.sort,
      parsed.options.minNetVoteScore ?? '',
      parsed.options.positiveNetVoteScore ?? '',
    ]
    if (parsed.summary) cursorScopeParts.push('summary')
    const cursorScope = cursorScopeParts.join(':')
    ctx.assert(
      ctx.query.after === undefined || typeof ctx.query.after === 'string',
      400,
      'Invalid cursor format',
    )
    const after =
      typeof ctx.query.after === 'string'
        ? parseEntityRelationCursor(ctx, ctx.query.after, cursorScope, parsed)
        : undefined
    const { results: relations, hasNextPage } = await getEntityRelationsPage(
      parsed.entityType,
      resolvedSubjectId,
      parsed.predicate,
      parsed.objectType,
      { ...parsed.options, after },
    )
    const relationsWithId = relations.filter((r): r is typeof r & { id: string } => !!r.id)
    const publicRelationsWithId = relationsWithId.map(
      relation =>
        withoutEntityRelationCursorMetadata(relation) as PublicEntityRelationResult & {
          id: string
        },
    )
    const entityIds = relationsWithId.map(r => r.id)

    // Include election votes for authenticated users
    const currentUser = await ctx.getCurrentUser()

    const output: Record<string, unknown> = {
      results: publicRelationsWithId.map(r => ({
        __entity_type: 'entity_relation' as const,
        id: r.id,
      })),
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: relationsWithId[0]
          ? encodeEntityRelationCursor(relationsWithId[0], cursorScope, parsed)
          : null,
        end_cursor:
          hasNextPage && relationsWithId.at(-1)
            ? encodeEntityRelationCursor(relationsWithId.at(-1)!, cursorScope, parsed)
            : null,
      },
      entity_relations: indexById(publicRelationsWithId),
      entity_relation_elections:
        entityIds.length > 0
          ? getEntityRelationElectionByIdCachedBatch(entityIds).then(indexById)
          : {},
    }
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    if (currentUser && entityIds.length > 0) {
      output.election_votes = getEntityRelationElectionVotesByUser(currentUser.id, entityIds).then(
        votes => {
          const votesMap = new Map(votes.map(vote => [vote.entity_id, vote]))
          const election_votes = electionVotesMapToRecord(votesMap)
          return Object.keys(election_votes).length > 0 ? election_votes : undefined
        },
      )
    }

    ctx.set('Content-Type', 'application/json')
    await ctx.pipeline(streamJsonObject(output))
  })

// POST /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType
// Create a new entity relation
app
  .route('/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
    )
    assertNotSuspended(currentUser)
    ctx.assert(
      ctx.params.entityType !== 'topic_alias' && ctx.params.objectType !== 'topic_alias',
      404,
      'Not found',
    )

    const body = (await ctx.request.json('1mb')) as { objectId?: string }
    const parsed = parseEntityRelationCreateInput({
      entityType: ctx.params.entityType!,
      entityId: ctx.params.entityId!,
      predicate: ctx.params.predicate!,
      objectType: ctx.params.objectType!,
      objectId: body.objectId,
    })

    // remote_actor relations (inbound ActivityPub follows) may only be written by the
    // signature-verified inbox receiver (Phase C2), never by a public API caller — otherwise any
    // authenticated user could fabricate an arbitrary "remote actor follows local user" relation.
    if (parsed.metadata.subject_type === 'remote_actor') {
      ctx.assert(false, 403, 'remote_actor relations cannot be created via this endpoint')
    }

    let resolvedUserTagTargetId: string | undefined
    if (parsed.metadata.subject_type === 'user') {
      resolvedUserTagTargetId = await assertUserTagAllowed(
        currentUser,
        parsed.subjectId.id,
        parsed.objectIds[0]!.id,
      )
      if (!isAdminUser(currentUser)) {
        const membershipPlan = await getUserActivePlan(currentUser.id)
        const contributionStatus = await getContributionStatus(currentUser, {
          membershipPlan,
          skipAccountAgeGate: true,
        })
        if (!contributionStatus.allowed) {
          ctx.assert(false, 403, 'A verified non-disposable email address is required to vote.')
        }
        await assertWithinContributionQuota(currentUser.id, false, membershipPlan)
      }
    }

    // Community relations require moderation authorization
    if (parsed.metadata.subject_type === 'community') {
      const communityId =
        typeof parsed.subjectId === 'string' ? parsed.subjectId : ctx.params.entityId!
      const community = await getCommunity(communityId)
      ctx.assert(community, 404, 'Community not found')
      const membership = await getCommunityMember(community.id, currentUser.id)
      ctx.assert(
        currentUserCanModerateCommunity(currentUser, community, membership ?? undefined),
        403,
        'Forbidden',
      )
    }

    // Manual tag-add cap (requirement 1 of #8246): a standing per-(subject, relation) cap on tags
    // a user manually adds through this route. Voting on an existing tag (handled by
    // upsertEntityRelation below) is unaffected -- assertWithinTagAddLimit only counts rows this
    // user originated (created_by_id), and voting never creates a new row in relation.table_name.
    // Deliberately broad: every election, non-bookmark relation on these subject types is capped
    // (category, related, faq, publisher_type, landing_page, terms_of_service, guide, ...), each
    // with its own independent budget since assertWithinTagAddLimit counts per relation.table_name.
    // `user` subject_type is excluded: user->topic->category is the vouch-tagging path gated above
    // by assertWithinContributionQuota, which counts against resolvedUserTagTargetId rather than
    // parsed.subjectId.id and must not be double-gated here. No other subject-type branch in this
    // route remaps subjectId the way the user branch does, so parsed.subjectId.id is safe to use
    // directly for every subject type reachable below.
    if (
      parsed.metadata.election &&
      !parsed.metadata.is_bookmark &&
      (parsed.metadata.subject_type === 'post' ||
        parsed.metadata.subject_type === 'topic' ||
        parsed.metadata.subject_type === 'rss_feed_item')
    ) {
      const membershipPlan = isAdminUser(currentUser)
        ? null
        : await getUserActivePlan(currentUser.id)
      await assertWithinTagAddLimit(
        currentUser,
        membershipPlan,
        parsed.metadata,
        parsed.subjectId.id,
        parsed.objectIds.length,
      )
    }

    // Upsert the relation (automatically votes for it)
    const relations = await upsertEntityRelation(
      currentUser,
      parsed.metadata,
      resolvedUserTagTargetId ? { id: resolvedUserTagTargetId } : parsed.subjectId,
      parsed.objectIds,
      resolvedUserTagTargetId ? { enqueueVoteStats: false } : undefined,
    )

    ctx.assert(relations.length > 0, 500, 'Failed to create entity relation')

    if (parsed.metadata.subject_type === 'user') {
      await Promise.all(
        relations.flatMap(relation =>
          relation.id
            ? [
                refreshEntityRelationVoteStatsFromPrimaryWithFallback(
                  createEntityRelationElectionTarget(relation.id, parsed.metadata.table_name),
                ),
              ]
            : [],
        ),
      )
    }

    const responseRelation =
      parsed.metadata.subject_type === 'user'
        ? (
            await getEntityRelations('user', resolvedUserTagTargetId!, 'category', 'topic', {
              readOnly: false,
            })
          ).find(relation => relation.id === relations[0]!.id)
        : relations[0]

    ctx.setStatus(201)
    ctx.json({
      relation: withoutEntityRelationCursorMetadata(
        (responseRelation ?? relations[0]!) as EntityRelationResult,
      ),
    })
  })
