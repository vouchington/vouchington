import { createHash } from 'node:crypto'
import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { appendCopyrightEmailIntakeRecommendation } from '@services/copyright-notices/email-recommendations'
import { getCopyrightEmailIntakeForAgent } from '@services/copyright-notices/email-intake-parses'
import onError from '@modules/on-error'
import { callCopyrightEmailIntakeModel, type CopyrightEmailIntakeModelCaller } from './model.mts'

const PROMPT_VERSION = 'copyright-email-intake-v3'

export type { CopyrightEmailIntakeModelCaller } from './model.mts'

export async function runCopyrightEmailIntakeAgent(
  intakeId: string,
  selection: ModelSelection,
  callModel: CopyrightEmailIntakeModelCaller = callCopyrightEmailIntakeModel,
): Promise<void> {
  const intake = await getCopyrightEmailIntakeForAgent(intakeId)
  if (!intake) {
    onError(new Error(`runCopyrightEmailIntakeAgent: intake not found: ${intakeId}`))
    return
  }
  const rawInput = JSON.stringify({
    senderEmail: intake.senderEmail,
    senderName: intake.senderName,
    subject: intake.subject,
    bodyText: intake.bodyText,
    attachments: intake.attachments.map(attachment => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      sha256: attachment.sha256.toString('hex'),
    })),
  })
  const sanitized = await sanitizePromptInjection(rawInput)
  const input = wrapExternalContent(sanitized, {
    source: 'inbound_email',
    contentType: 'copyright-submission',
  })
  const inputSha256 = createHash('sha256').update(input).digest()
  const safetyIdentifier = createHash('sha256').update(intake.amazon_ses_message_id).digest('hex')
  const { output, model } = await callAgentModel({
    agentSlug: 'copyright-email-intake',
    selection,
    input,
    safetyIdentifier,
    callModel,
  })
  await appendCopyrightEmailIntakeRecommendation({
    intakeId,
    inputSha256,
    promptVersion: PROMPT_VERSION,
    model,
    structuredOutput: output,
  })
}
