import createHttpError from 'http-errors'
import type { BasicUser } from '@services/users/types'
import { createEntityRelationAction } from '@services/entity-relation-actions'
import { addPostHashtag } from '@services/posts'
import { requirePrivateToolUser } from './private-user.mts'
import type { Tool, ToolInvocationContext } from './types.mts'

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
            entity_id: { type: 'string' },
            predicate: { type: 'string' },
            object_type: { type: 'string' },
            object_id: { type: 'string' },
          },
          required: ['action', 'entity_type', 'entity_id', 'predicate', 'object_type', 'object_id'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            action: { const: 'add_tag' },
            post_id: { type: 'string' },
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
    surfaces: ['mcp'],
    title: 'Add Entity Relation',
    plan: 'plus',
    requiredScopes: { mcp: ['entity-relations:read', 'entity-relations:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [
      {
        method: 'POST',
        path: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      },
      { method: 'PATCH', path: '/api/v1/posts/:idOrSlug' },
    ],
  },
  function:
    (currentUser: BasicUser) =>
    async (
      args: AddEntityRelationArgs,
      invocationContext?: ToolInvocationContext,
    ): Promise<AddEntityRelationResult> => {
      const currentPrivateUser = await requirePrivateToolUser(currentUser)
      if (!invocationContext) throw createHttpError(403, 'Delegated tool context is required')
      if (invocationContext.credentialOwnerId !== currentPrivateUser.id)
        throw createHttpError(403, 'Forbidden')
      const authority = {
        kind: 'delegated' as const,
        credentialOwnerId: invocationContext.credentialOwnerId,
        grantedScopes: invocationContext.grantedScopes,
      }
      if (args.action === 'add_tag') {
        return addPostHashtag(currentPrivateUser, args.post_id, args.tag, authority)
      }
      const { relation, metadata } = await createEntityRelationAction(
        currentPrivateUser,
        authority,
        {
          entityType: args.entity_type,
          entityId: args.entity_id,
          predicate: args.predicate,
          objectType: args.object_type,
          objectId: args.object_id,
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
