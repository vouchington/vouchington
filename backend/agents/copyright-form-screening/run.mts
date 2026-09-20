import { createHash } from 'node:crypto'
import {
  callRecordingAgentResponseUsage,
  parseLLMJsonResponse,
  createOpenAIResponse,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  appendCopyrightFormScreening,
  getCopyrightFormIntakeForScreening,
} from '@services/copyright-notices/form-screenings'

const PROMPT =
  'Classify this already structured copyright form only for obvious spam or invalidity. Return JSON {"recommendation":"clear"|"invalid_or_spam"|"uncertain","rationale":"..."}. Do not decide legal ownership or take action.'
const PROMPT_VERSION = 'copyright-form-screening-v1'
export async function runCopyrightFormScreeningAgent(
  submissionId: string,
): Promise<'clear' | 'invalid_or_spam' | 'uncertain' | null> {
  const intake = await getCopyrightFormIntakeForScreening(submissionId)
  if (!intake) return null
  const input = JSON.stringify({
    statutory_fields_complete: intake.statutoryFieldsComplete,
    work_description: intake.workDescription,
  })
  const safeInput = wrapExternalContent(await sanitizePromptInjection(input), {
    source: 'copyright_form',
    contentType: 'copyright-complaint',
  })
  const response = await callRecordingAgentResponseUsage(
    () =>
      createOpenAIResponse(
        {
          model: DEFAULT_AGENT_MODEL,
          instructions: PROMPT,
          input: safeInput,
          metadata: { type: 'copyright-form-screening' },
          service_tier: 'flex',
          text: { format: { type: 'json_object' } },
        } as Parameters<typeof createOpenAIResponse>[0],
        { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
      ),
    { agentSlug: 'copyright-form-screening' },
  )
  const { recommendation, rationale } = parseCopyrightFormScreeningOutput(
    extractTextFromOpenAIResponse(response),
  )
  await appendCopyrightFormScreening({
    intakeId: intake.intakeId,
    inputSha256: createHash('sha256').update(safeInput).digest(),
    recommendation,
    rationale,
    promptVersion: PROMPT_VERSION,
    model: DEFAULT_AGENT_MODEL,
  })
  return recommendation
}

export function parseCopyrightFormScreeningOutput(text: string): {
  recommendation: 'clear' | 'invalid_or_spam' | 'uncertain'
  rationale: string
} {
  let output: { recommendation?: unknown; rationale?: unknown } | null
  try {
    output = parseLLMJsonResponse<{ recommendation?: unknown; rationale?: unknown }>(text)
  } catch {
    throw new TypeError('Invalid copyright form screening JSON')
  }
  const recommendation = output?.recommendation
  const rationale = output?.rationale
  if (
    (recommendation !== 'clear' &&
      recommendation !== 'invalid_or_spam' &&
      recommendation !== 'uncertain') ||
    typeof rationale !== 'string' ||
    rationale.length > 10_000
  )
    throw new TypeError('Invalid copyright form screening output')
  return { recommendation, rationale }
}
