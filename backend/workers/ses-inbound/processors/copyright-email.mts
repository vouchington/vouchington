import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import { ErasedCopyrightEmailIntakeReplay } from '@services/copyright-notices/email-intakes'
import { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError, parseSesInboundMime } from './mime.mts'
import {
  copySesInboundObjectToCopyrightEvidence,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
} from './s3.mts'
import { copyrightEvidenceEmailKey as evidenceKey } from './evidence-key.mts'

export async function processCopyrightInboundEmail(data: SesInboundProcessJobData): Promise<void> {
  let preserved: Awaited<ReturnType<typeof preserveCopyrightEvidence>>
  try {
    preserved = await preserveCopyrightEvidence(data)
  } catch (err) {
    if (err instanceof ErasedCopyrightEmailIntakeReplay) return
    throw err
  }
  const { intake, sourceIdentity } = preserved
  try {
    const email = await parseSesInboundMime(
      await loadSesInboundObjectVersion(data.objectKey, sourceIdentity),
    )
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: email.fromEmail,
      ...(email.fromName ? { fromName: email.fromName } : {}),
      subject: email.subject,
      bodyText: email.bodyText,
      messageId: email.emailMessageId,
      inReplyTo: email.inReplyTo,
      replyReferences: email.references,
      autoSubmitted: email.autoSubmitted,
      precedence: email.precedence,
      listId: email.listId,
      listUnsubscribe: email.listUnsubscribe,
      attachments: (email.attachments ?? []).map(attachment => ({
        filename: attachment.filename,
        contentId: attachment.contentId,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
      })),
    })
  } catch (err) {
    if (err instanceof ErasedCopyrightEmailIntakeReplay) return
    if (!(err instanceof SesInboundTerminalError) && !isUntrustedShapeError(err)) throw err
    try {
      await recordCopyrightEmailParse(intake, {
        status: 'failed',
        error: 'The original email could not be parsed as RFC 5322 MIME.',
      })
    } catch (err_) {
      if (err_ instanceof ErasedCopyrightEmailIntakeReplay) return
      throw err_
    }
    return
  }
  await enqueueCopyrightEmailIntake(intake.id)
}

async function preserveCopyrightEvidence(data: SesInboundProcessJobData): Promise<{
  intake: Awaited<ReturnType<typeof createCopyrightEmailIntake>>['intake']
  sourceIdentity: Awaited<ReturnType<typeof loadSesInboundObjectAndHash>>['sourceIdentity']
}> {
  const { rawMime, digest, receivedAt, sourceIdentity } = await loadSesInboundObjectAndHash(
    data.objectKey,
  )
  rawMime.resume()
  const raw = await digest
  const rawStorageKey = evidenceKey(data.sesMessageId, raw.sha256)
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId: data.sesMessageId,
    receivedAt,
    rawStorageKey,
    rawSha256: raw.sha256,
    rawMimeType: 'message/rfc822',
    rawByteSize: raw.byteSize,
    sesVerdicts: raw.sesVerdicts,
    preserveRawEvidence: () =>
      copySesInboundObjectToCopyrightEvidence(
        data.objectKey,
        data.sesMessageId,
        raw.sha256,
        sourceIdentity,
      ),
  })
  return { intake, sourceIdentity }
}

function isUntrustedShapeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown; statusCode?: unknown }).status
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return status === 422 || statusCode === 422
}
