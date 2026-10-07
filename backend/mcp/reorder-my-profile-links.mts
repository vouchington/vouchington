import { listProfileLinks, reorderProfileLinks, type ProfileLink } from '@services/my/profile-links'
import type { BasicUser } from '@services/users/types'
import { PROFILE_LINKS_RESULT_SCHEMA, REORDER_PARAMETERS } from './profile-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type ReorderMyProfileLinksArgs = { ids: string[] }

const tool: Tool<ReorderMyProfileLinksArgs, { success: true; results: ProfileLink[] }> = {
  schema: {
    name: 'reorder_my_profile_links',
    type: 'function',
    description:
      "Set the order of the current user's profile links. Send every link ID exactly once, in the order to show them; a partial list or an ID that is not the user's own is refused. A profile holds at most 20 links, so the whole ordered list is returned.",
    parameters: REORDER_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Reorder My Profile Links',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'PUT', path: '/api/v1/my/profile/links/order' }],
    outputSchema: PROFILE_LINKS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ReorderMyProfileLinksArgs) => {
    const user = await requireActiveToolUser(currentUser)
    await reorderProfileLinks(user.id, args.ids)
    return { success: true, results: await listProfileLinks(user.id) }
  },
}

export default tool
