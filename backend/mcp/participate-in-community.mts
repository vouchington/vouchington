import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { getCommunityOrThrow, joinCommunity } from '@services/communities'
import { createConversationMessage } from '@services/messaging/create'
import {
  loadModmailOpeningAccess,
  openAuthorizedModmailThread,
  loadModmailReplyAccess,
  admitModmailReplyParticipant,
} from '@services/modmail/member-actions'
import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { componentSchema } from './route-response-schema.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { adminOutputSchema, wrapAdminOutput } from './untrusted-output.mts'
import { requireActiveToolUser } from './private-user.mts'

type Option = 'join' | 'open_modmail' | 'reply_modmail'
type Args = {
  community_id: string
  subject_user_id?: string
  conversationId?: string
  text?: string
}

const endpoints: Record<Option, ToolApiEndpoint> = {
  join: { method: 'POST', path: '/api/v1/communities/:idOrSlug/members' },
  open_modmail: { method: 'POST', path: '/api/v1/communities/:idOrSlug/modmail' },
  reply_modmail: {
    method: 'POST',
    path: '/api/v1/communities/:idOrSlug/modmail/:conversationId/messages',
  },
}
const descriptions: Record<Option, string> = {
  join: 'Join a public community. Private communities require an invitation or apply_to_community.',
  open_modmail: 'Open modmail as a member; moderators may specify subject_user_id.',
  reply_modmail:
    'Reply to your modmail thread or one you moderate. Resolved threads reject replies.',
}

function source(option: Option): MergedToolSource<Args> {
  const properties: Record<string, unknown> = {
    community_id: { type: 'string', description: 'Community UUID or slug' },
  }
  const required = ['community_id']
  if (option !== 'join') {
    const bodySchema = componentSchema(
      option === 'open_modmail'
        ? 'OpenCommunityModmailRequest'
        : 'CreateCommunityModmailMessageRequest',
    )
    Object.assign(properties, bodySchema['properties'])
    required.push(...((bodySchema['required'] as string[] | undefined) ?? []))
  }
  if (option === 'reply_modmail') {
    properties['conversationId'] = { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 }
    required.push('conversationId')
  }
  const outputSchema =
    option === 'join'
      ? successSchema({ community_id: { type: 'string', format: 'uuid' } })
      : (adminOutputSchema(
          objectSchema(
            option === 'open_modmail'
              ? { thread: componentSchema('ModmailThread') }
              : { message: componentSchema('DirectMessage') },
          ),
        ) as ToolOutputSchema)
  return {
    schema: {
      description: descriptions[option],
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
    meta: {
      audience: 'user',
      title: 'Participate in Community',
      plan: 'plus',
      requiredScopes: ['communities:read', 'communities:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      api: [endpoints[option]],
      outputSchema,
    },
    function: currentUser => async args => {
      const user = await requireActiveToolUser(currentUser)
      if (option === 'join') {
        const community = await getCommunityOrThrow(args.community_id)
        await joinCommunity(user.id, community)
        return { success: true, community_id: community.id }
      }
      if (option === 'open_modmail') {
        const access = await loadModmailOpeningAccess(user, args.community_id)
        return wrapAdminOutput({
          thread: await openAuthorizedModmailThread(user, access, args.subject_user_id),
        })
      }
      const access = await loadModmailReplyAccess(user, args.community_id, args.conversationId!)
      await admitModmailReplyParticipant(user, access)
      return wrapAdminOutput({
        message: await createConversationMessage(
          user.id,
          getRequestContentProvenance(),
          args.conversationId!,
          args.text!,
        ),
      })
    },
  }
}

export const participateInCommunityGroup = {
  name: 'participate_in_community',
  options: [
    { option: 'join', source: source('join') },
    { option: 'open_modmail', source: source('open_modmail') },
    { option: 'reply_modmail', source: source('reply_modmail') },
  ],
} as const

export default createMergedTool(
  participateInCommunityGroup.name,
  'Participate in Community',
  participateInCommunityGroup.options,
)
