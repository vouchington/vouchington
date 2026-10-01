import type { BasicUser } from '@services/users/types'
import type { Tool, ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
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
import { requirePrivateToolUser } from './private-user.mts'
import { routePropertySchema, routeResponseSchema } from './route-response-schema.mts'

const API = {
  cards: { method: 'GET', path: '/api/v1/my/cards' },
  pointValuations: { method: 'GET', path: '/api/v1/my/rewards-program-point-valuations' },
  statuses: { method: 'GET', path: '/api/v1/my/rewards-program-statuses' },
} as const satisfies Record<string, ToolApiEndpoint>

// This tool reshapes three REST bodies into one flat result, so it owns the result schema. Each
// section still comes from its REST twin’s generated contract.
function buildOutputSchema(): ToolOutputSchema {
  const cards = routeResponseSchema(API.cards)
  const pointValuations = routeResponseSchema(API.pointValuations)
  const statuses = routeResponseSchema(API.statuses)
  const properties = {
    success: { const: true },
    cards: routePropertySchema(cards, 'results'),
    cards_page_info: routePropertySchema(cards, 'page_info'),
    point_valuations: routePropertySchema(pointValuations, 'results'),
    point_valuations_page_info: routePropertySchema(pointValuations, 'page_info'),
    rewards_program_statuses: routePropertySchema(statuses, 'results'),
    rewards_program_statuses_page_info: routePropertySchema(statuses, 'page_info'),
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

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
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_profile',
    type: 'function',
    description:
      "Get the current user's wallet profile including their cards, point valuations, rewards program statuses.",
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
    api: [API.cards, API.pointValuations, API.statuses],
    outputSchema: buildOutputSchema(),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const [cardPage, pointValuationPage, rewardsProgramStatuses] = await Promise.all([
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
      ])

      return {
        success: true,
        cards: cardPage.results,
        cards_page_info: cardPage.page_info,
        point_valuations: pointValuationPage.results,
        point_valuations_page_info: pointValuationPage.page_info,
        rewards_program_statuses: rewardsProgramStatuses.results,
        rewards_program_statuses_page_info: rewardsProgramStatuses.page_info,
      }
    },
}

export default tool
