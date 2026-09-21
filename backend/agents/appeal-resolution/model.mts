import {
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
  createOpenRouterResponse,
  toOpenRouterModel,
} from '@agents/_shared'
import { renderContentPolicyForPrompt } from '@services/moderation/content-policy'

export type AppealModelCaller = (input: string, safetyIdentifier: string) => Promise<unknown>

const APPEAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommended_action: {
      type: 'string',
      enum: ['accept', 'deny', 'reduce'],
    },
    public_response: { type: 'string' },
    internal_response: { type: 'string' },
  },
  required: ['recommended_action', 'public_response', 'internal_response'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are an AI assistant helping human moderators evaluate a moderation appeal filed by a user.

## Content Policy

${renderContentPolicyForPrompt()}

## Task

A user has filed a formal appeal against a moderation action (warning, community ban, or post removal). Evaluate the appeal against the original action's rationale and recommend a resolution.

## Output format

Respond with a JSON object containing:
- **recommended_action**: one of "accept", "deny", "reduce"
- **public_response**: A respectful draft response addressed to the appellant that a human moderator will edit before sending
- **internal_response**: Detailed reasoning for moderators

## Guidelines

- "accept": The moderation action was unwarranted or disproportionate; recommend reversing it.
- "deny": The moderation action was appropriate; recommend upholding it.
- "reduce": The moderation action was partially justified but overly harsh; recommend a lighter sanction.
- Default to "deny" when uncertain — be conservative about reversing moderation decisions.
- Your response will be reviewed and edited by a human moderator before anything is communicated.`

/* v8 ignore start -- thin OpenRouter integration wrapper; exercised by credentialed *.openrouter.test.mts */
export function callAppealModel(
  input: string,
  safetyIdentifier: string,
): Promise<Awaited<ReturnType<typeof createOpenRouterResponse>>> {
  return createOpenRouterResponse(
    {
      model: toOpenRouterModel(DEFAULT_AGENT_MODEL),
      instructions: SYSTEM_PROMPT,
      input,
      safety_identifier: safetyIdentifier,
      metadata: { type: 'appeal-resolution' },
      service_tier: 'flex',
      // SYSTEM_PROMPT embeds the full content policy — a stable, large static prefix across
      // every appeal. Versioned so a prompt edit can be paired with a key bump to invalidate.
      prompt_cache_key: 'appeal-resolution-v1',
      text: {
        format: {
          type: 'json_schema',
          name: 'appeal_resolution',
          schema: APPEAL_JSON_SCHEMA,
        },
      },
    } as unknown as Parameters<typeof createOpenRouterResponse>[0],
    { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
  )
}
/* v8 ignore stop */
