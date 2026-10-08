import { QUEUED_BACKGROUND_RETRY_POLICY, type AgentModelCaller } from '@agents/_shared'
import { generateJson } from '@modules/model-providers/generate'
import {
  renderContentPolicyForPrompt,
  renderReportReasonPolicyCoverageForPrompt,
} from '@services/moderation/content-policy'

export type JudgementOutput = {
  recommended_action: 'no_action' | 'warn' | 'remove' | 'escalate'
  public_response: string
  internal_response: string
}

export type JudgementModelCaller = AgentModelCaller<JudgementOutput>

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

/* v8 ignore start -- thin provider integration wrapper; exercised by credentialed *.anthropic.test.mts */
export const callJudgementModel: JudgementModelCaller = (
  input,
  safetyIdentifier,
  { selection, openaiTransport },
) =>
  generateJson(
    selection,
    {
      instructions: SYSTEM_PROMPT,
      input,
      schemaName: 'report_judgement',
      schema: JUDGEMENT_JSON_SCHEMA,
      // The schema (enum included) already validated the answer.
      parse: value => value as JudgementOutput,
      maxOutputTokens: 2_000,
      safetyIdentifier,
      // SYSTEM_PROMPT embeds the full content policy + report-reason coverage -- the largest
      // static prefix of any agent in the repo, and cached input is 10x cheaper. Versioned so a
      // prompt edit here can be paired with a key bump if the cache should be invalidated.
      promptCacheKey: 'report-judgement-v1',
      flex: true,
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
    },
    { openaiTransport },
  )
/* v8 ignore stop */
