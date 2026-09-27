import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getEntityRelationsPage,
  type PublicEntityRelationResult,
} from '@services/entity-relations/query'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { parseEntityRelationSearchInput } from '@services/entity-relations'
import { getEntityRelationElectionVotesByUser } from '@services/elections-votes/entity-relation'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getEntityRelationElectionByIdCachedBatch } from '@services/entity-fetch/get'
import { indexById } from '@modules/utils'
import { entityRelationViewerFor, getPublicUserByIdOrSlug } from '@services/users'
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
  assertCreateEntityRelationActionAdmission,
  createEntityRelationAction,
} from '@services/entity-relation-actions'
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

    const currentUser = await ctx.getCurrentUser()
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
      { ...parsed.options, after, viewer: entityRelationViewerFor(currentUser) },
    )
    const relationsWithId = relations.filter((r): r is typeof r & { id: string } => !!r.id)
    const publicRelationsWithId = relationsWithId.map(
      relation =>
        withoutEntityRelationCursorMetadata(relation) as PublicEntityRelationResult & {
          id: string
        },
    )
    const entityIds = relationsWithId.map(r => r.id)

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

    // Include election votes for authenticated users
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
    assertCreateEntityRelationActionAdmission(
      currentUser,
      ctx.params.entityType!,
      ctx.params.objectType!,
    )
    const body = (await ctx.request.json('1mb')) as { objectId?: string }
    const { relation } = await createEntityRelationAction(
      currentUser,
      { kind: 'first_party' },
      {
        entityType: ctx.params.entityType!,
        entityId: ctx.params.entityId!,
        predicate: ctx.params.predicate!,
        objectType: ctx.params.objectType!,
        objectId: body.objectId,
      },
    )

    ctx.setStatus(201)
    ctx.json({ relation: withoutEntityRelationCursorMetadata(relation) })
  })
