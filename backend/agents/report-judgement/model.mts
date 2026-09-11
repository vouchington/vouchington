import {
  createOpenAIResponse,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import {
  renderContentPolicyForPrompt,
  renderReportReasonPolicyCoverageForPrompt,
} from '@services/moderation/content-policy'

export type JudgementModelCaller = (input: string, safetyIdentifier: string) => Promise<unknown>

const JUDGEMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommended_action: {
      type: 'string',
      enum: ['no_action', 'warn', 'remove', 'escalate'],
    },
    public_response: { type: 'string' },
    internal_response: { type: 'string' },
  },
  required: ['recommended_action', 'public_response', 'internal_response'],
  additionalProperties: false,
} as const

export const SYSTEM_PROMPT = `You are a content moderation assistant. Your job is to review reported content and recommend a moderation action.

## Content Policy

${renderContentPolicyForPrompt()}

## Report Reason Guidance

${renderReportReasonPolicyCoverageForPrompt()}

## Output format

Respond with a JSON object containing:
- **recommended_action**: one of "no_action", "warn", "remove", "escalate"
- **public_response**: A brief, neutral explanation suitable for sharing with the reporter (1-2 sentences, no internal details)
- **internal_response**: A detailed reasoning for moderators, referencing specific policy categories and evidence

## Guidelines

- "no_action": The content does not violate policy.
- "warn": The content is borderline; issue a formal warning.
- "remove": The content clearly violates policy and must be removed.
- "escalate": The content requires human moderator review (e.g. legal risk, CSAM, credible threats).
- Always be conservative — if unsure, escalate.
- Do not assume guilt; consider context and community rules.`

/* v8 ignore start -- thin OpenAI integration wrapper; exercised by credentialed *.openai.test.mts */
export function callJudgementModel(
  input: string,
  safetyIdentifier: string,
): Promise<Awaited<ReturnType<typeof createOpenAIResponse>>> {
  return createOpenAIResponse(
    {
      model: DEFAULT_AGENT_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      safety_identifier: safetyIdentifier,
      metadata: { type: 'report-judgement' },
      service_tier: 'flex',
      // SYSTEM_PROMPT embeds the full content policy + report-reason coverage — the largest
      // static prefix of any agent in the repo, and cached input is 10x cheaper. Versioned so a
      // prompt edit here can be paired with a key bump if the cache should be invalidated.
      prompt_cache_key: 'report-judgement-v1',
      text: {
        format: {
          type: 'json_schema',
          name: 'report_judgement',
          schema: JUDGEMENT_JSON_SCHEMA,
        },
      },
    } as unknown as Parameters<typeof createOpenAIResponse>[0],
    { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
  )
}
/* v8 ignore stop */
