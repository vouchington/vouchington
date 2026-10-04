import { isUUID } from '@modules/utils'
import {
  getRssFeedItemElectionVotesByElectionId,
  getRssFeedItemElectionVotesByUserForEntity,
} from '@services/elections-votes/rss-feed-item'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getFollowedUsersByElectionVote } from '@services/users/follow-context'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { pageInfoSchema } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type DetailArgs = { rss_feed_item_id: string }
type VotesArgs = DetailArgs & { limit?: number; after?: string }
type FollowUsers = { total: number; users: Array<{ id: string }> }
type FollowResult =
  | { success: true; positive_by_following: FollowUsers; negative_by_following: FollowUsers }
  | { success: false; error: string }
type Vote = { user_id: string; entity_id: string; choice: string; created_at: string }
type VotesResult =
  | {
      success: true
      results: Vote[]
      page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
    }
  | { success: false; error: string }

const followUsersSchema = closedObject({
  total: pickProperties('FollowContextUsers', ['total']).total!,
  users: { type: 'array', items: closedObject({ id: pickProperties('BasicUser', ['id']).id! }) },
})

export const getRssFeedItemFollowContextTool: Tool<DetailArgs, FollowResult> = {
  schema: {
    name: 'get_rss_feed_item_follow_context',
    type: 'function',
    description:
      'For an RSS item, list up to five users you follow who voted positively or negatively, with the total for each side. Uses the same follow and vote visibility policy as REST.',
    parameters: {
      type: 'object',
      properties: { rss_feed_item_id: { type: 'string', format: 'uuid' } },
      required: ['rss_feed_item_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get RSS Feed Item Follow Context',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feed-items:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feed-items/:id/follow-context' }],
    outputSchema: foundOrNotFoundSchema({
      positive_by_following: followUsersSchema,
      negative_by_following: followUsersSchema,
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: DetailArgs): Promise<FollowResult> => {
      if (!isUUID(args.rss_feed_item_id) || !(await getRssFeedItemById(args.rss_feed_item_id))) {
        return { success: false, error: 'RSS feed item not found' }
      }
      const [positive, negative] = await Promise.all([
        getFollowedUsersByElectionVote(
          currentUser,
          args.rss_feed_item_id,
          'rss_feed_item_votes',
          1,
        ),
        getFollowedUsersByElectionVote(
          currentUser,
          args.rss_feed_item_id,
          'rss_feed_item_votes',
          -1,
        ),
      ])
      return {
        success: true,
        positive_by_following: {
          total: positive.total,
          users: positive.users.map(user => ({ id: user.id })),
        },
        negative_by_following: {
          total: negative.total,
          users: negative.users.map(user => ({ id: user.id })),
        },
      }
    },
}

export const getRssFeedItemVotesTool: Tool<VotesArgs, VotesResult> = {
  schema: {
    name: 'get_rss_feed_item_votes',
    type: 'function',
    description:
      'List votes on an RSS item. As on REST, administrators see all votes and other callers see only their own. Returns at most 100 per page with page_info.end_cursor.',
    parameters: {
      type: 'object',
      properties: {
        rss_feed_item_id: { type: 'string', format: 'uuid' },
        limit: { type: 'integer', minimum: 1, description: 'Defaults to 100; clamped to 100.' },
        after: { type: 'string' },
      },
      required: ['rss_feed_item_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get RSS Feed Item Votes',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feed-items:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feed-items/:id/votes' }],
    outputSchema: foundOrNotFoundSchema({
      results: {
        type: 'array',
        items: closedObject(
          pickProperties('ElectionVote_sentiment', [
            'user_id',
            'entity_id',
            'choice',
            'created_at',
          ]),
        ),
      },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: VotesArgs): Promise<VotesResult> => {
      if (!isUUID(args.rss_feed_item_id) || !(await getRssFeedItemById(args.rss_feed_item_id))) {
        return { success: false, error: 'RSS feed item not found' }
      }
      const page = await findPageOrNull(args.after, () => {
        const options = { limit: clampToolLimit(args.limit, 100, 100), after: args.after }
        return currentUser.roles.includes('administrator')
          ? getRssFeedItemElectionVotesByElectionId(args.rss_feed_item_id, options)
          : getRssFeedItemElectionVotesByUserForEntity(
              currentUser.id,
              args.rss_feed_item_id,
              options,
            )
      })
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: page.results.map(vote => ({
          user_id: vote.user_id,
          entity_id: vote.entity_id,
          choice: vote.choice,
          created_at: new Date(vote.created_at).toISOString(),
        })),
        page_info: page.page_info,
      }
    },
}

export const rssFeedItemSocialReadTools = [getRssFeedItemFollowContextTool, getRssFeedItemVotesTool]
