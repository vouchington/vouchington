import { listProfileLinks } from '@services/my/profile-links'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { PROFILE_LINKS_RESULT_SCHEMA } from './profile-tool-support.mts'

type ToolResult = { success: true; results: Awaited<ReturnType<typeof listProfileLinks>> }

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_my_profile_links',
    type: 'function',
    description:
      "List the current user's own profile links in display order: each link's id, link_type, url, handle, name, image_id and sort_order. There are at most 20, so the list is not paged. They are the user's own text and are not sanitized. Use the ids with update_my_profile_link, delete_my_profile_link and reorder_my_profile_links, and read the bio with get_my_bio.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Profile Links',
    requiredScopes: { mcp: ['profile:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/profile/links' }],
    outputSchema: PROFILE_LINKS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => ({
    success: true,
    results: await listProfileLinks(currentUser.id),
  }),
}

export default tool
