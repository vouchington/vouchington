import type { ElectionVoteMutationResult } from '@services/elections-votes/shared'
import assert from 'http-assert'
import type { BasicUser } from '@services/users/types'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import { applyVoteMutation } from '@services/elections-votes/vote-handler'
import type {
  CreateVoteHandlerOptions,
  VoteAccessContext,
} from '@services/elections-votes/vote-handler-options'
import { postVoteOptions } from '@services/posts/vote-handler-options'
import { topicVoteOptions } from '@services/topics/vote-handler-options'
import { rssFeedItemVoteOptions } from '@services/rss-feed-items/vote-handler-options'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type VoteArgs = { id: string; choice: string }
type ClearArgs = { id: string }
type VoteResult = { success: true }

const SENTIMENT_CHOICES = ['vouch', 'like', 'neutral', 'dislike', 'disavow'] as const
const POST_CHOICES = [...SENTIMENT_CHOICES, 'support', 'oppose'] as const
const OUTPUT_SCHEMA = successSchema({})
const accessContext = { assert }

function voteSource(
  options: CreateVoteHandlerOptions<ElectionVoteMutationResult, VoteAccessContext>,
  entity: 'post' | 'topic' | 'rss_feed_item',
  isClear: boolean,
  choices: readonly string[],
): MergedToolSource<VoteArgs | ClearArgs, VoteResult> {
  const path =
    entity === 'post'
      ? '/api/v1/posts/:id/vote'
      : entity === 'topic'
        ? '/api/v1/topics/:id/vote'
        : '/api/v1/rss-feed-items/:id/vote'
  return {
    schema: {
      description: isClear
        ? `Clear your current ${entity.replaceAll('_', ' ')} vote. A vote already cleared succeeds without changing anything.`
        : `Set your ${entity.replaceAll('_', ' ')} vote. A repeated choice succeeds without changing anything. A post's allowed choices depend on its election policy.`,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: `The ${entity.replaceAll('_', ' ')} ID.`,
          },
          ...(isClear
            ? {}
            : { choice: { type: 'string', enum: choices, description: 'Semantic vote choice.' } }),
        },
        required: isClear ? ['id'] : ['id', 'choice'],
        additionalProperties: false,
      },
    },
    meta: {
      surfaces: ['mcp'],
      title: 'Vote',
      plan: 'plus',
      requiredScopes: { mcp: ['votes:write'] },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      api: [{ method: isClear ? 'DELETE' : 'PUT', path }],
      outputSchema: OUTPUT_SCHEMA,
    },
    function:
      (currentUser: BasicUser) =>
      async (args: VoteArgs | ClearArgs, invocationContext?: ToolInvocationContext) => {
        const user = await requirePrivateToolUser(currentUser)
        getDelegatedToolAuthority(user, invocationContext)
        await applyVoteMutation(options, {
          currentUser: user,
          entityId: args.id,
          isClear,
          accessContext,
          // The MCP dispatcher charges the selected REST route from meta.api before invocation.
          applyRouteRateLimit: async () => {},
          readBody: async () => args,
          validateRequest: () => {},
          // MCP credentials are not cookie sessions; the vote limiter still keys on user and IP.
          getSessionData: async () => null,
          ip: invocationContext?.mcpRateLimit?.ip,
          userAgent: null,
        })
        return { success: true }
      },
  }
}

export const voteGroup = {
  name: 'vote',
  options: [
    { option: 'set_post', source: voteSource(postVoteOptions, 'post', false, POST_CHOICES) },
    { option: 'clear_post', source: voteSource(postVoteOptions, 'post', true, POST_CHOICES) },
    {
      option: 'set_topic',
      source: voteSource(topicVoteOptions, 'topic', false, SENTIMENT_CHOICES),
    },
    {
      option: 'clear_topic',
      source: voteSource(topicVoteOptions, 'topic', true, SENTIMENT_CHOICES),
    },
    {
      option: 'set_rss_feed_item',
      source: voteSource(rssFeedItemVoteOptions, 'rss_feed_item', false, SENTIMENT_CHOICES),
    },
    {
      option: 'clear_rss_feed_item',
      source: voteSource(rssFeedItemVoteOptions, 'rss_feed_item', true, SENTIMENT_CHOICES),
    },
  ],
} as const

export default createMergedTool(voteGroup.name, 'Vote', voteGroup.options)
