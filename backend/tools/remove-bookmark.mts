import type { BasicUser } from '@services/users/types'
import { deleteBookmarkAction } from '@services/entity-relation-actions'
import { BOOKMARK_TOOL_PARAMETERS, type BookmarkToolArgs } from './bookmark-tool-support.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<BookmarkToolArgs, { success: true }> = {
  schema: {
    name: 'remove_bookmark',
    type: 'function',
    description:
      'Remove a saved, followed, muted, or blocked relation the current user set on an entity. Removing a relation that is not set changes nothing, and the entity does not have to be visible any more.',
    parameters: BOOKMARK_TOOL_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Remove Bookmark',
    plan: 'plus',
    requiredScopes: { mcp: ['bookmarks:read', 'bookmarks:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/bookmarks/:entityType/:entityId/:predicate' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: BookmarkToolArgs) => {
    await deleteBookmarkAction(await requirePrivateToolUser(currentUser), {
      entityType: args.entity_type,
      entityId: args.entity_id,
      predicate: args.predicate,
    })
    return { success: true }
  },
}

export default tool
