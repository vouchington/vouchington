import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { assertOpenAiSpendCapNotBreached } from '@services/ai-usage'
import {
  currentUserCanModerateCommunity,
  getCommunityMember,
  getCommunityOrThrow,
} from '@services/communities'
import {
  getCommunityAgentPrompt,
  getCommunityAgentPromptFalsePositiveEstimate,
  normalizeSimulationLimit,
  normalizeSimulationTimeWindow,
  searchCommunityAgentPromptSimulationPosts,
} from '@services/community-agent-prompts'
import { simulateCommunityPromptOnPosts } from '@agents/community-moderation'
import { createAutomodSimulationResults } from './automod-simulate-response.mts'

app.route('/api/v1/communities/:idOrSlug/automod/simulate').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/automod/simulate')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanModerateCommunity(currentUser, community, membership), 403, 'Forbidden')

  const body = (await ctx.request.json('1mb')) as {
    prompt_id?: unknown
    prompt?: unknown
    time_window_hours?: unknown
    limit?: unknown
  }
  ctx.assert(typeof body.prompt_id === 'string' && body.prompt_id, 422, 'prompt_id is required')
  if (body.prompt !== undefined) {
    ctx.assert(typeof body.prompt === 'string', 422, 'prompt must be a string')
    ctx.assert(body.prompt.trim().length > 0, 422, 'prompt must not be empty')
    ctx.assert(body.prompt.length <= 10000, 422, 'prompt must be 10,000 characters or fewer')
  }

  const prompt = await getCommunityAgentPrompt(body.prompt_id)
  ctx.assert(prompt, 404, 'Prompt not found')
  ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')

  let timeWindowHours: ReturnType<typeof normalizeSimulationTimeWindow>
  let limit: number
  try {
    timeWindowHours = normalizeSimulationTimeWindow(body.time_window_hours)
    limit = normalizeSimulationLimit(body.limit)
  } catch (err) {
    ctx.throw(422, err instanceof Error ? err.message : 'Invalid simulation options')
  }

  const promptOverride = typeof body.prompt === 'string' ? body.prompt : undefined
  const [posts, falsePositiveEstimate] = await Promise.all([
    searchCommunityAgentPromptSimulationPosts(community.id, { timeWindowHours, limit }),
    promptOverride === undefined
      ? getCommunityAgentPromptFalsePositiveEstimate(community.id, prompt.id)
      : Promise.resolve(null),
  ])
  if (posts.length > 0) {
    const spendCapBreach = await assertOpenAiSpendCapNotBreached('automod-simulate')
    ctx.assert(!spendCapBreach, 429, 'Daily OpenAI spend cap reached, try again after UTC midnight')
  }

  const simulationResults = await simulateCommunityPromptOnPosts(prompt, posts, {
    currentUserId: currentUser.id,
    promptOverride,
  })
  const results = createAutomodSimulationResults(prompt, posts, simulationResults)

  ctx.json({
    simulation: {
      prompt_id: prompt.id,
      time_window_hours: timeWindowHours,
      sample_count: posts.length,
      would_flag_count: results.filter(result => result.flagged).length,
      would_unpublish_count: results.filter(result => result.would_unpublish).length,
      false_positive_estimate: falsePositiveEstimate,
    },
    results,
  })
})
