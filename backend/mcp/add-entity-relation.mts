import createHttpError from 'http-errors'
import type { BasicUser } from '@services/users/types'
import { createEntityRelationAction } from '@services/entity-relation-actions'
import {
  canonicalEntityIds,
  entityIdOrMissing,
  MISSING_REFERENCE_ID,
} from './resolve-entity-reference.mts'
import { addPostHashtag } from '@services/posts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { requirePrivateToolUser } from './private-user.mts'
import type {
  Tool,
  ToolApiEndpoint,
  ToolInvocationContext,
} from '@services/openai-agents/tool-types'
import { selectApiByArgument } from '@vouchington/mcp-server/tools'
import { objectSchema, oneOfSchema } from '@vouchington/mcp-server/schema'

const text = { type: 'string' }

// The two actions return different shapes, and neither is a REST body, so the tool owns this
// schema. `relation_id` is absent when the relation row carries no id.
const OUTPUT_SCHEMA = oneOfSchema(
  objectSchema(
    {
      relation_id: text,
      subject_type: text,
      subject_id: text,
      predicate: text,
      object_type: text,
      object_id: text,
    },
    ['relation_id'],
  ),
  objectSchema({ post_id: text, tag: text, topic_alias_id: text }),
)

type AddEntityRelationArgs =
  | {
      action: 'add_relation'
      entity_type: string
      entity_id: string
      predicate: string
      object_type: string
      object_id: string
    }
  | { action: 'add_tag'; post_id: string; tag: string }

type AddEntityRelationResult =
  | {
      relation_id?: string
      subject_type: string
      subject_id: string
      predicate: string
      object_type: string
      object_id: string
    }
  | { post_id: string; tag: string; topic_alias_id: string }

const ENDPOINTS: Record<AddEntityRelationArgs['action'], ToolApiEndpoint> = {
  add_relation: {
    method: 'POST',
    path: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
  },
  add_tag: { method: 'PATCH', path: '/api/v1/posts/:idOrSlug' },
}

const tool: Tool<AddEntityRelationArgs, AddEntityRelationResult> = {
  schema: {
    name: 'add_entity_relation',
    type: 'function',
    description: 'Add a relation between existing entities or add a hashtag to your own post.',
    parameters: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: {
            action: { const: 'add_relation' },
            entity_type: { type: 'string' },
            entity_id: {
              type: 'string',
              description: 'Subject id, or its slug, exact topic name, feed URL, or username',
            },
            predicate: { type: 'string' },
            object_type: { type: 'string' },
            object_id: {
              type: 'string',
              description: 'Object id, or its slug, exact topic name, feed URL, or username',
            },
          },
          required: ['action', 'entity_type', 'entity_id', 'predicate', 'object_type', 'object_id'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            action: { const: 'add_tag' },
            post_id: { type: 'string', description: 'Post id or slug' },
            tag: { type: 'string' },
          },
          required: ['action', 'post_id', 'tag'],
          additionalProperties: false,
        },
      ],
    },
    strict: true,
  },
  meta: {
    audience: 'user',
    title: 'Add Entity Relation',
    plan: 'plus',
    requiredScopes: ['entity-relations:read', 'entity-relations:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: Object.values(ENDPOINTS),
    selectApi: selectApiByArgument('action', ENDPOINTS),
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (
      args: AddEntityRelationArgs,
      invocationContext?: ToolInvocationContext,
    ): Promise<AddEntityRelationResult> => {
      const currentPrivateUser = await requirePrivateToolUser(currentUser)
      const authority = getDelegatedToolAuthority(currentPrivateUser, invocationContext)
      if (args.action === 'add_tag') {
        return addPostHashtag(
          currentPrivateUser,
          await entityIdOrMissing('post', args.post_id),
          args.tag,
          authority,
        )
      }
      const [entityId, objectId] =
        args.entity_type === args.object_type
          ? (await canonicalEntityIds(args.entity_type, [args.entity_id, args.object_id])).map(
              id => id ?? MISSING_REFERENCE_ID,
            )
          : await Promise.all([
              entityIdOrMissing(args.entity_type, args.entity_id),
              entityIdOrMissing(args.object_type, args.object_id),
            ])
      const { relation, metadata } = await createEntityRelationAction(
        currentPrivateUser,
        authority,
        {
          entityType: args.entity_type,
          entityId: entityId!,
          predicate: args.predicate,
          objectType: args.object_type,
          objectId: objectId!,
        },
      )
      if (!relation.subject_id)
        throw createHttpError(500, 'Created entity relation is missing its subject identifier')
      if (!relation.object_id)
        throw createHttpError(500, 'Created entity relation is missing its object identifier')
      return {
        ...(relation.id ? { relation_id: relation.id } : {}),
        subject_type: metadata.subject_type,
        subject_id: relation.subject_id,
        predicate: metadata.predicate,
        object_type: metadata.object_type,
        object_id: relation.object_id,
      }
    },
}

export default tool
