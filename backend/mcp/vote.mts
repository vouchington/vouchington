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
import { hostnameVoteOptions } from '@services/elections-votes/hostname/vote-handler-options'
import { userVouchVoteOptions } from '@services/elections-votes/user-vouch/vote-handler-options'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import {
  topicReferenceSchema,
  postReferenceSchema,
  userReferenceSchema,
} from './entity-reference-schema.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
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

type VoteEntity = 'post' | 'topic' | 'rss_feed_item' | 'hostname' | 'user_vouch'

const VOTE_PATHS: Record<VoteEntity, string> = {
  post: '/api/v1/posts/:id/vote',
  topic: '/api/v1/topics/:id/vote',
  rss_feed_item: '/api/v1/rss-feed-items/:id/vote',
  hostname: '/api/v1/hostnames/:id/vote',
  user_vouch: '/api/v1/users/:id/vouch-vote',
}

function voteSource(
  options: CreateVoteHandlerOptions<ElectionVoteMutationResult, VoteAccessContext>,
  entity: VoteEntity,
  isClear: boolean,
  choices: readonly string[],
): MergedToolSource<VoteArgs | ClearArgs, VoteResult> {
  const path = VOTE_PATHS[entity]
  const label = entity === 'user_vouch' ? 'user vouch' : entity.replaceAll('_', ' ')
  return {
    schema: {
      description: isClear
        ? `Clear your current ${label} vote. A vote already cleared succeeds without changing anything.`
        : `Set your ${label} vote. A repeated choice succeeds without changing anything.${entity === 'post' ? " A post's allowed choices depend on its election policy." : ''}`,
      parameters: {
        type: 'object',
        properties: {
          id:
            entity === 'post'
              ? postReferenceSchema
              : entity === 'topic'
                ? topicReferenceSchema
                : entity === 'user_vouch'
                  ? userReferenceSchema
                  : {
                      type: 'string',
                      format: 'uuid',
                      description: `The ${label} ID.`,
                    },
          ...(isClear ? {} : { choice: { type: 'string', enum: choices } }),
        },
        required: isClear ? ['id'] : ['id', 'choice'],
        additionalProperties: false,
      },
    },
    meta: {
      audience: 'user',
      title: 'Vote',
      plan: 'plus',
      requiredScopes: ['votes:write'],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      api: [{ method: isClear ? 'DELETE' : 'PUT', path }],
      outputSchema: OUTPUT_SCHEMA,
    },
    function:
      (currentUser: BasicUser) =>
      async (args: VoteArgs | ClearArgs, invocationContext?: ToolInvocationContext) => {
        const user = await requirePrivateToolUser(currentUser)
        getDelegatedToolAuthority(user, invocationContext)
        const entityType = entity === 'user_vouch' ? 'user' : entity
        const entityId = await canonicalEntityId(entityType, args.id)
        assert(entityId, 404, 'Not found')
        await applyVoteMutation(options, {
          currentUser: user,
          entityId,
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
    {
      option: 'set_hostname',
      source: voteSource(hostnameVoteOptions, 'hostname', false, SENTIMENT_CHOICES),
    },
    {
      option: 'clear_hostname',
      source: voteSource(hostnameVoteOptions, 'hostname', true, SENTIMENT_CHOICES),
    },
    {
      option: 'set_user_vouch',
      source: voteSource(userVouchVoteOptions, 'user_vouch', false, SENTIMENT_CHOICES),
    },
    {
      option: 'clear_user_vouch',
      source: voteSource(userVouchVoteOptions, 'user_vouch', true, SENTIMENT_CHOICES),
    },
  ],
} as const

export default createMergedTool(voteGroup.name, 'Vote', voteGroup.options)
