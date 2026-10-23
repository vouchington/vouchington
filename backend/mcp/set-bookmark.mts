import { isUUID } from '@modules/utils'
import type { BasicUser } from '@services/users/types'
import type { MergedToolSource } from './create-merged-tool.mts'
import { BOOKMARK_TOOL_ENTITY_TYPES, BOOKMARK_TOOL_PREDICATES } from './bookmark-tool-support.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'
import {
  setBookmarkTargets,
  SET_BOOKMARK_LIMIT,
  type BookmarkTargetResult,
  type SetBookmarkArgs,
} from './set-bookmark-batch.mts'

function isTopicTarget(target: unknown): boolean {
  return (
    typeof target === 'object' &&
    target !== null &&
    (target as { entity_type?: unknown }).entity_type === 'topic'
  )
}

function isImportedTopicTarget(target: unknown): boolean {
  if (!isTopicTarget(target)) return false
  const entity = (target as { entity?: unknown }).entity
  return typeof entity !== 'string' || !isUUID(entity.trim())
}

const TARGET = {
  type: 'object',
  properties: {
    entity_type: {
      type: 'string',
      enum: BOOKMARK_TOOL_ENTITY_TYPES,
      description: 'Entity type.',
    },
    entity: { type: 'string' },
  },
  required: ['entity_type', 'entity'],
  additionalProperties: false,
}

// recommend_unknown_topics false must not require idempotency_key. The batch handler
// requires that key only when the flag is true.
const tool: MergedToolSource<SetBookmarkArgs, { success: true; results: BookmarkTargetResult[] }> =
  {
    schema: {
      description: 'Follow, save, mute, or block up to 500 targets.',
      parameters: {
        type: 'object',
        properties: {
          predicate: { type: 'string', enum: BOOKMARK_TOOL_PREDICATES },
          targets: {
            type: 'array',
            minItems: 1,
            maxItems: SET_BOOKMARK_LIMIT,
            items: TARGET,
          },
          recommend_unknown_topics: { type: 'boolean' },
          idempotency_key: { type: 'string', format: 'uuid' },
        },
        required: ['predicate', 'targets'],
        additionalProperties: false,
      },
    },
    meta: {
      audience: 'user',
      title: 'Set Bookmark',
      plan: 'plus',
      requiredScopes: ['bookmarks:read', 'bookmarks:write'],
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      api: [
        { method: 'PUT', path: '/api/v1/bookmarks/:entityType/:entityId/:predicate' },
        { method: 'POST', path: '/api/v1/my/import/topics' },
      ],
      selectApi: args => {
        const bookmark = {
          method: 'PUT' as const,
          path: '/api/v1/bookmarks/:entityType/:entityId/:predicate',
        }
        const topicImport = { method: 'POST' as const, path: '/api/v1/my/import/topics' }
        const targets = args['targets']
        if (Array.isArray(targets)) {
          const topicFollow =
            args['recommend_unknown_topics'] === true && args['predicate'] === 'follow'
          const importsTopics = topicFollow && targets.some(target => isImportedTopicTarget(target))
          const bookmarkTargetCount = targets.filter(
            target => !(topicFollow && isImportedTopicTarget(target)),
          ).length
          return [
            ...(importsTopics ? [{ ...topicImport, weight: 1 }] : []),
            ...(bookmarkTargetCount > 0 ? [{ ...bookmark, weight: bookmarkTargetCount }] : []),
          ]
        }
        // Route probes set one field at a time, including the string sentinel "present".
        if (
          args['recommend_unknown_topics'] != null &&
          args['recommend_unknown_topics'] !== false
        ) {
          return [topicImport]
        }
        if (targets != null || args['predicate'] != null) return [bookmark]
        return []
      },
      outputSchema: successSchema({
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entity_type: { type: 'string' },
              entity: { type: 'string' },
              status: {
                type: 'string',
                enum: ['set', 'error', 'followed', 'already_following', 'recommendation_created'],
              },
            },
            required: ['entity_type', 'entity', 'status'],
            additionalProperties: true,
          },
        },
      }),
    },
    function: (currentUser: BasicUser) => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      return {
        success: true as const,
        results: await setBookmarkTargets(
          user,
          getDelegatedToolAuthority(user, invocationContext),
          args,
        ),
      }
    },
  }

export default tool
