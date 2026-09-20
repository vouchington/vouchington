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
  'This is only an anti-spam gate for an already structured copyright form. Return invalid_or_spam only for obvious spam or obvious invalidity; otherwise return not_obviously_invalid, including when legal merits are uncertain. Return JSON {"recommendation":"not_obviously_invalid"|"invalid_or_spam","rationale":"..."}. Do not decide legal ownership or take action.'
const PROMPT_VERSION = 'copyright-form-screening-v2'
export async function runCopyrightFormScreeningAgent(
  submissionId: string,
): Promise<'not_obviously_invalid' | 'invalid_or_spam' | null> {
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
  recommendation: 'not_obviously_invalid' | 'invalid_or_spam'
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
    (recommendation !== 'not_obviously_invalid' && recommendation !== 'invalid_or_spam') ||
    typeof rationale !== 'string' ||
    rationale.length > 10_000
  )
    throw new TypeError('Invalid copyright form screening output')
  return { recommendation, rationale }
}
