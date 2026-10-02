import { prepareCommunityPromptDryRun } from '@agents/community-moderation'
import type { Context } from '@jongleberry/api-server'
import { assertOpenAiSpendCapNotBreached } from '@services/ai-usage'
import { currentUserCanModerateCommunity, getCommunityMember } from '@services/communities'
import { getCommunityAgentPrompt } from '@services/community-agent-prompts'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import { getPromptTestTrainingLabel } from '@services/moderation-training/prompt-test-label'
import app from '../../../app.mts'
import {
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'

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
    validateUUIDParam(ctx, 'promptId')

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

    const spendCapBreach = await assertOpenAiSpendCapNotBreached('agent-prompt-test-run-moderation')
    ctx.assert(!spendCapBreach, 429, 'Daily OpenAI spend cap reached, try again after UTC midnight')

    // A no-persist classifier dry run: the same question, model and threshold as a real run, with
    // no receipt, attempt or moderation row. It records its own usage against the cost ledger, so
    // recording it again here would double-count every test run in /admin/ai-costs. A cap breach
    // after the pre-check is an `OpenAiSpendCapBreachError`, which carries status 429.
    const dryRun = await prepareCommunityPromptDryRun({
      communityId: community.id,
      prompt: { id: prompt.id, text: prompt.prompt },
    })
    const verdict = await dryRun.classify([{ content: body.text }])

    if (body.save_for_training === true) {
      ctx.assert(body.expected_flagged !== undefined, 422, 'expected_flagged is required')
      await recordModerationTrainingFeedback({
        trainingEvidence: 'staff_or_user',
        sourceType: 'prompt_test_run',
        eventType: 'prompt_test_labelled',
        label: getPromptTestTrainingLabel(body.expected_flagged, verdict.flagged),
        humanAction: 'save_prompt_test_run',
        actorUserId: currentUser.id,
        communityId: community.id,
        postId: null,
        inputSha256: null,
        metadata: {
          prompt_id: promptId,
          classifier_model_name: dryRun.modelName,
          classifier_model_provider: dryRun.modelProvider,
          test_text: body.text,
          expected_flagged: body.expected_flagged,
          expected_reason: body.expected_reason ?? null,
          actual_flagged: verdict.flagged,
          actual_probability: verdict.probability,
        },
      })
    }

    // The classifier answers with a probability, not a reason; the response shape is unchanged.
    ctx.json({ flagged: verdict.flagged, reason: '' })
  })
