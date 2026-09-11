import {
  createOpenAIResponse,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import { renderContentPolicyForPrompt } from '@services/moderation/content-policy'

/** The model-calling seam. Injectable so tests can exercise the agent without OpenAI. */
export type DisputeModelCaller = (input: string, safetyIdentifier: string) => Promise<unknown>

const DISPUTE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommended_action: {
      type: 'string',
      enum: ['no_action', 'remove', 'annotate', 'dismiss'],
    },
    public_response: { type: 'string' },
    internal_response: { type: 'string' },
  },
  required: ['recommended_action', 'public_response', 'internal_response'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are an AI assistant helping human moderators evaluate a formal review dispute filed by a verified topic representative.

## Content Policy

${renderContentPolicyForPrompt()}

## Task

A verified topic representative has filed a formal dispute against a review of their topic. Evaluate the dispute claim against the review content and recommend a resolution.

## Output format

Respond with a JSON object containing:
- **recommended_action**: one of "no_action", "remove", "annotate", "dismiss"
- **public_response**: A respectful draft response addressed to the claimant that a human moderator will edit before sending
- **internal_response**: Detailed reasoning for moderators, referencing the dispute claim and specific policy evidence

## Guidelines

- "no_action": The review does not violate policy based on the dispute claim.
- "remove": The review clearly violates policy and must be removed.
- "annotate": The review is inaccurate or misleading but warrants a contextual note rather than removal.
- "dismiss": The dispute claim is unfounded or does not meet the policy bar.
- Default to "dismiss" when uncertain and the claim does not meet the policy bar.
- Your response will be reviewed and edited by a human moderator before anything is communicated.`

/* v8 ignore start -- thin OpenAI integration wrapper; exercised by credentialed *.openai.test.mts */
export function callDisputeModel(
  input: string,
  safetyIdentifier: string,
): Promise<Awaited<ReturnType<typeof createOpenAIResponse>>> {
  return createOpenAIResponse(
    {
      model: DEFAULT_AGENT_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      safety_identifier: safetyIdentifier,
      metadata: { type: 'dispute-resolution' },
      service_tier: 'flex',
      // SYSTEM_PROMPT embeds the full content policy — a stable, large static prefix across
      // every dispute. Versioned so a prompt edit can be paired with a key bump to invalidate.
      prompt_cache_key: 'dispute-resolution-v1',
      text: {
        format: {
          type: 'json_schema',
          name: 'dispute_resolution',
          schema: DISPUTE_JSON_SCHEMA,
        },
      },
    } as unknown as Parameters<typeof createOpenAIResponse>[0],
    { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
  )
}
/* v8 ignore stop */
