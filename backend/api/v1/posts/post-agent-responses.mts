import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { currentUserCanViewAgents } from '@services/agents/authorization'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { getAgentByAny } from '@services/agents/get-by-any'
import { getPostByAnyCached } from '@services/entity-fetch'
import { searchAgentConversations } from '@services/agents/conversations'
import { searchPostModerationsByAgent } from '@services/moderation'
import { getRouteAccessPost } from './get-route-access-post.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'

const responsesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 10 },
})

// GET /api/v1/posts/:postId/agents/:agentId/responses — Admin: view agent responses for a post
app.route('/api/v1/posts/:postId/agents/:agentId/responses').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts/:postId/agents/:agentId/responses', responsesParser)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanViewAgents,
    'GET:/api/v1/posts/:postId/agents/:agentId/responses',
  )

  const post = await getPostByAnyCached(ctx.params.postId!)
  ctx.assert(post && !post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')

  const agent = await getAgentByAny(ctx.params.agentId!)
  ctx.assert(agent, 404, 'Agent not found')

  const { limit, after } = responsesParser.parse(ctx.query)

  if (agent.agent_type === 'moderator') {
    const scope = `post-agent-moderations:${post.id}:${agent.id}`
    const decodedAfter = after
      ? decodeScopedUuidCursor(after, scope, 'Invalid cursor format')
      : undefined
    const { results, hasNextPage } = await searchPostModerationsByAgent(post.id, agent.id, {
      limit,
      after: decodedAfter,
    })
    ctx.json({
      results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, scope) : null,
        end_cursor:
          hasNextPage && results.at(-1) ? encodeScopedUuidCursor(results.at(-1)!.id, scope) : null,
      },
      agent,
    })
    return
  }

  if (agent.agent_type !== 'autotagger') {
    ctx.throw(422, `Unsupported agent type: ${agent.agent_type}`)
  }

  // autotagger: return agent conversations for this post
  const { results, page_info } = await searchAgentConversations(agent.system_user_id, {
    post_id: post.id,
    limit,
    after,
  })
  ctx.json({ results, page_info, agent })
})
