import { QUEUED_BACKGROUND_RETRY_POLICY, type AgentModelCaller } from '@agents/_shared'
import { generateJson } from '@modules/model-providers/generate'
import { renderContentPolicyForPrompt } from '@services/moderation/content-policy'

export type AppealOutput = {
  recommended_action: 'accept' | 'deny' | 'reduce'
  public_response: string
  internal_response: string
}

/** The model-calling seam. Injectable so tests can exercise the agent without a provider. */
export type AppealModelCaller = AgentModelCaller<AppealOutput>

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

/* v8 ignore start -- thin provider integration wrapper; exercised by credentialed *.anthropic.test.mts */
export const callAppealModel: AppealModelCaller = (
  input,
  safetyIdentifier,
  { selection, openaiTransport },
) =>
  generateJson(
    selection,
    {
      instructions: SYSTEM_PROMPT,
      input,
      schemaName: 'appeal_resolution',
      schema: APPEAL_JSON_SCHEMA,
      // The schema (enum included) already validated the answer.
      parse: value => value as AppealOutput,
      maxOutputTokens: 1500,
      safetyIdentifier,
      // SYSTEM_PROMPT embeds the full content policy, a stable large static prefix. Versioned so a
      // prompt edit can be paired with a key bump to invalidate.
      promptCacheKey: 'appeal-resolution-v1',
      flex: true,
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
    },
    { openaiTransport },
  )
/* v8 ignore stop */
