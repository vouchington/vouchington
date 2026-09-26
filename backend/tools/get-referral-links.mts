import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicByAny } from '@services/topics/get'
import { getPrioritizedReferralLinks } from '@services/prioritized-referral-links/get-prioritized'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'

type ToolArgs = {
  topic_id: string
}

type ReferralLinkEntry = {
  id: string
  url: string
  label: string | null
  priority_group: number
  username: string
  display_name: string | null
}

type ToolResult =
  | {
      success: true
      referral_program_id: string
      links: ReferralLinkEntry[]
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_referral_links',
    type: 'function',
    description:
      'Get prioritized referral links for a topic. Ranks links by social connections: mutual follows, follows, referrers, positive-choice authors, then everyone else.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description:
            'The topic identifier (UUID or slug) to look up referral links for. Can be a referral program topic or any topic with a linked referral program.',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Referral Links',
    requiredScopes: { mcp: ['referral-links:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:id/prioritized-referral-links' }],
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = await getTopicByAny(args.topic_id)

      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      let referralProgramId: string
      if (topic.topic_type === 'referral_program') {
        referralProgramId = topic.id
      } else if (topic.referral_program_id) {
        referralProgramId = topic.referral_program_id
      } else {
        return { success: false, error: 'No referral program found for this topic' }
      }

      const { links: allLinks, users } = await getPrioritizedReferralLinks(
        currentUser.id,
        referralProgramId,
      )

      const links: ReferralLinkEntry[] = await Promise.all(
        allLinks.map(async link => {
          const user = link.user_id != null ? users[link.user_id] : undefined
          return {
            id: link.id,
            url: link.url,
            label:
              link.label != null
                ? await sanitizePromptInjection(link.label, { isTitle: true })
                : null,
            priority_group: link.priority_group,
            username: user?.username ?? link.user_id ?? link.id,
            display_name: user?.display_name ?? null,
          }
        }),
      )

      return {
        success: true,
        referral_program_id: referralProgramId,
        links,
      }
    },
}

export default tool
