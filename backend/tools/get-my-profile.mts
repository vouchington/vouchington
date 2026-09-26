import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import {
  getIndividualCards,
  getIndividualRewardsProgramPointValuations,
  getIndividualRewardsProgramStatuses,
  type IndividualCard,
  type IndividualCardPage,
  type IndividualRewardsProgramPointValuation,
  type IndividualRewardsProgramPointValuationPage,
  type IndividualRewardsProgramStatus,
  type IndividualRewardsProgramStatusPage,
} from '@services/individuals-households'
import { getUserFinancialProfile } from '@services/user-financial-profiles'
import { requirePrivateToolUser } from './private-user.mts'

type ToolArgs = {
  cards_after?: string
  cards_limit?: number
  point_valuations_after?: string
  point_valuations_limit?: number
  rewards_program_statuses_after?: string
  rewards_program_statuses_limit?: number
}

type ToolResult = {
  success: true
  cards: IndividualCard[]
  cards_page_info: IndividualCardPage['page_info']
  point_valuations: IndividualRewardsProgramPointValuation[]
  point_valuations_page_info: IndividualRewardsProgramPointValuationPage['page_info']
  rewards_program_statuses: IndividualRewardsProgramStatus[]
  rewards_program_statuses_page_info: IndividualRewardsProgramStatusPage['page_info']
  financial_profile: unknown | null
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_profile',
    type: 'function',
    description:
      "Get the current user's wallet profile including their cards, point valuations, rewards program statuses, and financial profile (credit score range, income range).",
    parameters: {
      type: 'object',
      properties: {
        cards_after: {
          type: 'string',
          description: 'Opaque cursor from the previous cards page',
        },
        cards_limit: {
          type: 'number',
          description: 'Number of cards to return, from 1 to 100',
        },
        point_valuations_after: {
          type: 'string',
          description: 'Opaque cursor from the previous point valuations page',
        },
        point_valuations_limit: {
          type: 'number',
          description: 'Number of point valuations to return, from 1 to 100',
        },
        rewards_program_statuses_after: {
          type: 'string',
          description: 'Opaque cursor from the previous rewards program statuses page',
        },
        rewards_program_statuses_limit: {
          type: 'number',
          description: 'Number of rewards program statuses to return, from 1 to 100',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Profile',
    requiredScopes: { mcp: ['profile:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/profile' }],
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const [cardPage, pointValuationPage, rewardsProgramStatuses, financialProfile] =
        await Promise.all([
          getIndividualCards(privateUser, privateUser, {
            after: args.cards_after,
            limit: args.cards_limit,
          }),
          getIndividualRewardsProgramPointValuations(privateUser, privateUser, {
            after: args.point_valuations_after,
            limit: args.point_valuations_limit,
          }),
          getIndividualRewardsProgramStatuses(privateUser, privateUser, {
            after: args.rewards_program_statuses_after,
            limit: args.rewards_program_statuses_limit,
          }),
          getUserFinancialProfile(privateUser.id),
        ])

      return {
        success: true,
        cards: cardPage.results,
        cards_page_info: cardPage.page_info,
        point_valuations: pointValuationPage.results,
        point_valuations_page_info: pointValuationPage.page_info,
        rewards_program_statuses: rewardsProgramStatuses.results,
        rewards_program_statuses_page_info: rewardsProgramStatuses.page_info,
        financial_profile: financialProfile,
      }
    },
}

export default tool
