import type { MergedToolSource } from './create-merged-tool.mts'
import { updateProfileMarkdown } from '@services/my/profile'
import type { BasicUser } from '@services/users/types'
import { BIO_PARAMETERS, BIO_RESULT_SCHEMA } from './profile-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'

type UpdateMyBioArgs = { markdown: string }
type UpdateMyBioResult = { success: true; profile: { id: string; markdown: string } }

const tool: MergedToolSource<UpdateMyBioArgs, UpdateMyBioResult> = {
  schema: {
    description:
      "Replace the current user's profile bio with new Markdown, up to 10,000 characters. The whole bio is overwritten, so include any text to keep. Links to blocked domains are refused.",
    parameters: BIO_PARAMETERS,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update My Bio',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/my/profile' }],
    outputSchema: BIO_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: UpdateMyBioArgs) => {
    const user = await requireActiveToolUser(currentUser)
    await updateProfileMarkdown(user.id, args.markdown)
    return { success: true, profile: { id: user.id, markdown: args.markdown } }
  },
}

export default tool
