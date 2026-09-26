import { callOpenAIModeration, prepareModerationInput } from '@agents/moderation/openai-moderation'
import { SYNCHRONOUS_REQUEST_RETRY_POLICY } from '@agents/_shared'
import type { Context } from '@jongleberry/api-server'
import { assertOpenAiSpendCapNotBreached } from '@services/ai-usage'
import { currentUserCanModerateCommunity, getCommunityMember } from '@services/communities'
import { getCommunityAgentPrompt } from '@services/community-agent-prompts'
import type { ActiveModeratorConfig } from '@services/moderation/moderation-prompts'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import { getPromptTestTrainingLabel } from '@services/moderation-training/prompt-test-label'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

import { getCommunityOrThrow } from './shared.mts'

app
  .route('/api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs',
    )

    const { idOrSlug, promptId } = ctx.params as { idOrSlug: string; promptId: string }
    const community = await getCommunityOrThrow(ctx, idOrSlug)
    const membership = await getCommunityMember(community.id, currentUser.id)

    ctx.assert(
      currentUserCanModerateCommunity(currentUser, community, membership),
      403,
      'Forbidden',
    )

    const prompt = await getCommunityAgentPrompt(promptId)
    ctx.assert(prompt, 404, 'Prompt not found')
    ctx.assert(prompt.community_id === community.id, 404, 'Prompt not found')

    const body = (await ctx.request.json('1mb')) as {
      text: string
      save_for_training?: boolean
      expected_flagged?: boolean
      expected_reason?: string
    }
    validateRequestContract(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs',
      { path: ctx.params, body },
    )
    ctx.assert(typeof body.text === 'string' && body.text, 422, 'text is required')

    const input = prepareModerationInput('', body.text)
    const config: ActiveModeratorConfig = {
      moderator_id: prompt.agent_id,
      moderator_slug: `community-prompt-${promptId}`,
      on_flag_action: 'review_queue',
      is_baseline: false,
      system_user_id: '',
      prompt: {
        id: promptId,
        prompt: prompt.prompt,
        model_name: prompt.model_name,
        model_provider: prompt.model_provider,
      },
    }

    // Dry-run: use a fake post object since we don't actually have one. id is null, not a
    // placeholder string — callOpenAIModeration now records usage keyed on it, and ai_usage_records
    // .post_id is a real FK; null is the documented "not post-scoped" value, a non-UUID string
    // would fail the insert on every test run.
    const fakePost = {
      id: null,
      post_type: 'link',
      created_by_id: currentUser.id,
    } as unknown as Parameters<typeof callOpenAIModeration>[2]

    const spendCapBreach = await assertOpenAiSpendCapNotBreached('agent-prompt-test-run-moderation')
    ctx.assert(!spendCapBreach, 429, 'Daily OpenAI spend cap reached, try again after UTC midnight')

    // callOpenAIModeration() already records usage internally via recordAgentResponseUsage() —
    // recording it again here would double-count every successful test run in /admin/ai-costs.
    // A moderator is waiting synchronously on this request, so it gets the 1-retry budget rather
    // than the queued-worker default of 2.
    const moderationCall = await callOpenAIModeration(input, config, fakePost, community.id, {
      retryPolicy: SYNCHRONOUS_REQUEST_RETRY_POLICY,
    })
    const { result } = moderationCall

    if (body.save_for_training === true) {
      ctx.assert(body.expected_flagged !== undefined, 422, 'expected_flagged is required')
      await recordModerationTrainingFeedback({
        sourceType: 'prompt_test_run',
        eventType: 'prompt_test_labelled',
        label: getPromptTestTrainingLabel(body.expected_flagged, result.flagged),
        humanAction: 'save_prompt_test_run',
        actorUserId: currentUser.id,
        communityId: community.id,
        postId: null,
        inputSha256: null,
        metadata: {
          prompt_id: promptId,
          prompt_model_name: prompt.model_name,
          prompt_model_provider: prompt.model_provider,
          test_text: body.text,
          expected_flagged: body.expected_flagged,
          expected_reason: body.expected_reason ?? null,
          actual_flagged: result.flagged,
          actual_reason: result.reason,
        },
      })
    }

    ctx.json({ flagged: result.flagged, reason: result.reason })
  })
