import type { MergedToolSource } from './create-merged-tool.mts'
import { listProfileLinks } from '@services/my/profile-links'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'
import { PROFILE_LINKS_RESULT_SCHEMA } from './profile-tool-support.mts'

type ToolResult = { success: true; results: Awaited<ReturnType<typeof listProfileLinks>> }

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      "List the current user's own profile links in display order: each link's id, link_type, url, handle, name, image_id and sort_order. There are at most 20, so the list is not paged. They are the user's own text and are not sanitized. Use the ids with edit_my_profile (option link), delete_my_profile_link and reorder_my_profile_links, and read the bio with read_my_profile (option bio).",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get My Profile Links',
    requiredScopes: { mcp: ['profile:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/profile/links' }],
    outputSchema: PROFILE_LINKS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const user = await requirePrivateToolUser(currentUser)
    return { success: true, results: await listProfileLinks(user.id) }
  },
}

export default tool
