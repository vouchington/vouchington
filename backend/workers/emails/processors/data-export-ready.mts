import type {
  EmailTemplateInput,
  ProcessSendDataExportReadyEmailVariables,
} from '@queues/emails/types'
import { renderDataExportReadyEmail } from '@email-templates/core'
import { getDataRequestById } from '@services/account-data-requests/get'
import { getExportDownloadUrl, SEVEN_DAYS_SECONDS } from '@services/account-data-requests/s3'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

const DAY_MS = 86_400_000

export const processSendDataExportReadyEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendDataExportReadyEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  if (!input.userId) return { status: 'skipped' as const, reason: 'missing_user' as const }

  const request = await getDataRequestById(input.userId, input.userId, variables.requestId)
  if (!request?.s3_key || request.status !== 'ready') {
    return { status: 'skipped' as const, reason: 'export_unavailable' as const }
  }

  const remainingMs = request.expires_at ? request.expires_at.getTime() - Date.now() : null
  const expiresInSeconds =
    remainingMs === null
      ? SEVEN_DAYS_SECONDS
      : Math.min(SEVEN_DAYS_SECONDS, Math.max(1, Math.floor(remainingMs / 1000)))
  const downloadUrl = await getExportDownloadUrl(request.s3_key, expiresInSeconds)
  const { subject, html, text } = await renderDataExportReadyEmail({
    downloadUrl,
    expiresInDays: remainingMs === null ? 7 : Math.max(1, Math.ceil(remainingMs / DAY_MS)),
    uiLocale: input.uiLocale ?? null,
  })
  return sendClassifiedEmail('processSendDataExportReadyEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  })
}
