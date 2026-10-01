import type { BasicUser } from '@services/users/types'
import { upsertBookmarkAction } from '@services/entity-relation-actions'
import {
  BOOKMARK_RESULT_SCHEMA,
  BOOKMARK_TOOL_PARAMETERS,
  type BookmarkToolArgs,
} from './bookmark-tool-support.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'
import type { Tool, ToolInvocationContext } from './types.mts'

type SetBookmarkResult = {
  success: true
  bookmark: {
    id?: string
    subject_id: string
    object_id: string
    created_at: Date
    created_by_id: string
  }
}

const tool: Tool<BookmarkToolArgs, SetBookmarkResult> = {
  schema: {
    name: 'set_bookmark',
    type: 'function',
    description:
      "Save, follow, mute, or block an entity for the current user. Setting a relation that already exists changes nothing. Muting or blocking a topic, user or feed also removes the user's follow of it. A post is only available if the user can see it; the user's own private posts additionally need the private-post consent scope.",
    parameters: BOOKMARK_TOOL_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Set Bookmark',
    plan: 'plus',
    requiredScopes: { mcp: ['bookmarks:read', 'bookmarks:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'PUT', path: '/api/v1/bookmarks/:entityType/:entityId/:predicate' }],
    outputSchema: successSchema({ bookmark: BOOKMARK_RESULT_SCHEMA }),
  },
  function:
    (currentUser: BasicUser) =>
    async (
      args: BookmarkToolArgs,
      invocationContext?: ToolInvocationContext,
    ): Promise<SetBookmarkResult> => {
      const currentPrivateUser = await requirePrivateToolUser(currentUser)
      const authority = getDelegatedToolAuthority(currentPrivateUser, invocationContext)
      const relation = await upsertBookmarkAction(currentPrivateUser, authority, {
        entityType: args.entity_type,
        entityId: args.entity_id,
        predicate: args.predicate,
      })
      // A bookmark upsert writes exactly one relation row.
      const { id, subject_id, object_id, created_at, created_by_id } = relation!
      return { success: true, bookmark: { id, subject_id, object_id, created_at, created_by_id } }
    },
}

export default tool
