import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { objectSchema } from './output-schema-shapes.mts'
import { componentPropertySchema } from './route-response-schema.mts'

// The bookmark predicates an agent may set. The REST route accepts every bookmark predicate; the
// rest (hide, subscribe, dismiss_recommendation, proxy_follow, proxy_mute) stay REST-only.
const BOOKMARK_TOOL_PREDICATES = ['save', 'follow', 'mute', 'block'] as const

const BOOKMARK_TOOL_RELATIONS = entityRelationMetadatum.filter(
  relation =>
    relation.subject_type === 'user' &&
    relation.is_bookmark &&
    (BOOKMARK_TOOL_PREDICATES as readonly string[]).includes(relation.predicate),
)

const BOOKMARK_TOOL_ENTITY_TYPES = [
  ...new Set(BOOKMARK_TOOL_RELATIONS.map(relation => relation.object_type)),
]

const VALID_COMBINATIONS = BOOKMARK_TOOL_PREDICATES.map(
  predicate =>
    `${predicate}: ${BOOKMARK_TOOL_RELATIONS.filter(relation => relation.predicate === predicate)
      .map(relation => relation.object_type)
      .join(', ')}`,
).join('; ')

export type BookmarkToolArgs = {
  entity_type: string
  entity_id: string
  predicate: string
}

/** The arguments both bookmark tools take: which relation of the caller's, on which entity. */
export const BOOKMARK_TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    entity_type: {
      type: 'string',
      enum: BOOKMARK_TOOL_ENTITY_TYPES,
      description: `The type of entity. Valid types per predicate: ${VALID_COMBINATIONS}.`,
    },
    entity_id: { type: 'string', format: 'uuid', description: 'The ID of the entity.' },
    predicate: {
      type: 'string',
      enum: BOOKMARK_TOOL_PREDICATES,
      description: 'The relation: save, follow, mute, or block.',
    },
  },
  required: ['entity_type', 'entity_id', 'predicate'],
  additionalProperties: false,
}

// The REST twin documents the stored relation. The tool keeps the fields that identify it, each
// taken from that documented schema, and leaves out the soft-delete columns a set never carries.
export const BOOKMARK_RESULT_SCHEMA = objectSchema(
  Object.fromEntries(
    ['id', 'subject_id', 'object_id', 'created_at', 'created_by_id'].map(field => [
      field,
      componentPropertySchema('EntityRelation', field),
    ]),
  ),
  ['id'],
)
