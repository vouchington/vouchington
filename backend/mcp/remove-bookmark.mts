import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import assert from 'http-assert'
import { deleteBookmarkAction } from '@services/entity-relation-actions'
import { BOOKMARK_TOOL_PARAMETERS, type BookmarkToolArgs } from './bookmark-tool-support.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

const tool: MergedToolSource<BookmarkToolArgs, { success: true }> = {
  schema: {
    description:
      'Remove a saved, followed, muted, or blocked relation the current user set on an entity. Removing a relation that is not set changes nothing, and the entity does not have to be visible any more.',
    parameters: BOOKMARK_TOOL_PARAMETERS,
  },
  meta: {
    audience: 'user',
    title: 'Remove Bookmark',
    plan: 'plus',
    requiredScopes: ['bookmarks:read', 'bookmarks:write'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/bookmarks/:entityType/:entityId/:predicate' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: BookmarkToolArgs) => {
    const entityId = await canonicalEntityId(args.entity_type, args.entity_id)
    assert(entityId, 404, 'Entity not found')
    await deleteBookmarkAction(await requirePrivateToolUser(currentUser), {
      entityType: args.entity_type,
      entityId,
      predicate: args.predicate,
    })
    return { success: true }
  },
}

export default tool
