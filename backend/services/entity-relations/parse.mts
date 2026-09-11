import createHttpError from 'http-errors'
import type { EntityRelationEntityType, EntityRelationPredicateType } from './config.mts'
import { entityRelationMetadatum } from './metadata.mts'
import type { EntityRelationQueryOptions } from './query.mts'
import { getPostRelatedUrlDisplayConfig } from './post-related-url-display-config.mts'

const validSubjectTypes = new Set<EntityRelationEntityType>(
  entityRelationMetadatum.map(metadata => metadata.subject_type),
)
const validObjectTypes = new Set<EntityRelationEntityType>(
  entityRelationMetadatum.map(metadata => metadata.object_type),
)
const validPredicates = new Set<EntityRelationPredicateType>(
  entityRelationMetadatum.map(metadata => metadata.predicate),
)

export function parseEntityRelationSearchInput(input: {
  entityType: string
  entityId: string
  predicate: string
  objectType: string
  minNetVoteScore?: unknown
  positiveNetVoteScore?: unknown
  limit?: unknown
  sort?: unknown
  summary?: unknown
}) {
  const entityType = parseEntityRelationEntityType(input.entityType, validSubjectTypes, 'subject')
  if (entityType === 'user' && !isUserTagTuple(input.predicate, input.objectType)) {
    throw createHttpError(400, 'User-subject relations must go through /api/v1/bookmarks')
  }
  const objectType = parseEntityRelationEntityType(input.objectType, validObjectTypes, 'object')
  const predicate = parseEntityRelationPredicate(input.predicate)
  const metadata = getEntityRelationMetadata(entityType, predicate, objectType)
  const summary = input.summary === true || input.summary === 'true'
  if (summary && !isPostRelatedUrlTuple(entityType, predicate, objectType)) {
    throw createHttpError(400, 'summary is only allowed for post -> related -> url relations')
  }
  if (
    summary &&
    [input.minNetVoteScore, input.positiveNetVoteScore, input.limit, input.sort].some(
      value => value !== undefined,
    )
  ) {
    throw createHttpError(400, 'summary owns vote filters, sort, and limit')
  }

  const minNetVoteScore =
    input.minNetVoteScore === undefined
      ? undefined
      : parseFiniteNumber(input.minNetVoteScore, 'minNetVoteScore must be a valid number')
  if (minNetVoteScore !== undefined && !metadata.election) {
    throw createHttpError(
      400,
      `minNetVoteScore is only allowed for election-enabled relations, but ${entityType} -> ${predicate} -> ${objectType} has no election`,
    )
  }

  const positiveNetVoteScore =
    input.positiveNetVoteScore === undefined
      ? undefined
      : input.positiveNetVoteScore === true || input.positiveNetVoteScore === 'true'
  if (positiveNetVoteScore === true && !metadata.election) {
    throw createHttpError(
      400,
      `positiveNetVoteScore is only allowed for election-enabled relations, but ${entityType} -> ${predicate} -> ${objectType} has no election`,
    )
  }

  const limit = summary
    ? getPostRelatedUrlDisplayConfig().summary_limit
    : input.limit === undefined
      ? 100
      : Math.min(Math.max(1, parseInteger(input.limit, 'limit must be a valid integer')), 200)

  const sort = summary ? 'best' : input.sort === 'newest' ? 'newest' : 'best'

  return {
    entityType,
    predicate,
    objectType,
    metadata,
    summary,
    subjectId: input.entityId,
    options: {
      minNetVoteScore,
      positiveNetVoteScore: summary ? true : positiveNetVoteScore,
      limit,
      sort,
    } satisfies EntityRelationQueryOptions,
  }
}

function isPostRelatedUrlTuple(
  entityType: EntityRelationEntityType,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
): boolean {
  return entityType === 'post' && predicate === 'related' && objectType === 'url'
}

export function parseEntityRelationCreateInput(input: {
  entityType: string
  entityId: string
  predicate: string
  objectType: string
  objectId?: string
}) {
  const entityType = parseEntityRelationEntityType(input.entityType, validSubjectTypes, 'subject')
  if (entityType === 'user' && !isUserTagTuple(input.predicate, input.objectType)) {
    throw createHttpError(400, 'User-subject relations must go through /api/v1/bookmarks')
  }
  const objectType = parseEntityRelationEntityType(input.objectType, validObjectTypes, 'object')
  const predicate = parseEntityRelationPredicate(input.predicate)
  const metadata = getEntityRelationMetadata(entityType, predicate, objectType)
  if (!input.objectId) throw createHttpError(400, 'Missing objectId in request body')

  return {
    metadata,
    subjectId: { id: input.entityId },
    objectIds: [{ id: input.objectId }],
  }
}

function isUserTagTuple(predicate: string, objectType: string): boolean {
  return predicate === 'category' && objectType === 'topic'
}

function parseEntityRelationEntityType(
  value: string,
  validTypes: Set<EntityRelationEntityType>,
  label: 'subject' | 'object',
): EntityRelationEntityType {
  const entityType = value as EntityRelationEntityType
  if (!validTypes.has(entityType)) {
    throw createHttpError(400, `Invalid ${label} entity type: ${value}`)
  }
  return entityType
}

function parseEntityRelationPredicate(value: string): EntityRelationPredicateType {
  const predicate = value as EntityRelationPredicateType
  if (!validPredicates.has(predicate)) {
    throw createHttpError(400, `Invalid predicate: ${value}`)
  }
  return predicate
}

function getEntityRelationMetadata(
  entityType: EntityRelationEntityType,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
) {
  const metadata = entityRelationMetadatum.find(
    item =>
      item.subject_type === entityType &&
      item.object_type === objectType &&
      item.predicate === predicate,
  )
  if (!metadata) {
    throw createHttpError(404, `Relation ${entityType} -> ${predicate} -> ${objectType} not found`)
  }
  return metadata
}

function parseFiniteNumber(value: unknown, message: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw createHttpError(400, message)
  return parsed
}

function parseInteger(value: unknown, message: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw createHttpError(400, message)
  return parsed
}
